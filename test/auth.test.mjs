import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { after, before, test } from "node:test";
import { createServer } from "node:http";

import { AmbientClient } from "../dist/index.js";
import { NodeAgentKey } from "../dist/node.js";

let server;
let baseURL;
const requests = [];

before(async () => {
  server = createServer(async (request, response) => {
    const body = await readJSON(request);
    requests.push({ path: request.url, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/v1/signup/agent-challenges") {
      response.writeHead(201).end(JSON.stringify({
        id: "signup-1", principalId: "principal-1", keyId: "key-1",
        audience: "ambient", expiresAt: "2026-10-01T00:00:00Z",
        signingPayload: Buffer.from("signup-payload").toString("base64url"),
      }));
      return;
    }
    if (request.url === "/v1/signup/agents") {
      verifySignature(requests[0].body.publicKey, "signup-payload", body.signature);
      response.writeHead(201).end(JSON.stringify({ principalId: "principal-1", actorId: "principal-1", keyId: "key-1" }));
      return;
    }
    if (request.url === "/v1/auth/challenges") {
      response.writeHead(201).end(JSON.stringify({
        id: "auth-1", actorId: "principal-1", keyId: "key-1", audience: "ambient",
        nonce: "nonce-1", expiresAt: "2026-10-01T00:00:00Z",
        signingPayload: Buffer.from("auth-payload").toString("base64url"),
      }));
      return;
    }
    if (request.url === "/v1/auth/tokens") {
      verifySignature(requests[0].body.publicKey, "auth-payload", body.signature);
      assert.equal(body.nonce, "nonce-1");
      response.writeHead(201).end(JSON.stringify({
        accessToken: "token-1", tokenType: "Bearer", actorId: "principal-1",
        expiresAt: "2026-10-01T00:15:00Z",
      }));
      return;
    }
    response.writeHead(404).end(JSON.stringify({ error: { code: "not_found", message: "missing" } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

after(async () => new Promise((resolve) => server.close(resolve)));

test("registers an agent, proves key possession, and returns a bound session", async () => {
  const key = NodeAgentKey.generate();
  const restored = NodeAgentKey.fromPKCS8(key.exportPKCS8());
  assert.equal(restored.publicKey, key.publicKey);

  const ambient = new AmbientClient({ baseURL });
  const session = await ambient.registerAndAuthenticateAgent(restored);

  assert.deepEqual(session.identity, {
    principalId: "principal-1", actorId: "principal-1", keyId: "key-1",
  });
  assert.equal(session.accessToken, "token-1");
  assert.equal(session.principal().principalId, "principal-1");
  assert.deepEqual(requests.map(({ path }) => path), [
    "/v1/signup/agent-challenges", "/v1/signup/agents",
    "/v1/auth/challenges", "/v1/auth/tokens",
  ]);
});

function verifySignature(publicKey, payload, signature) {
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKey }, format: "jwk" });
  assert.equal(verify(null, Buffer.from(payload), key, Buffer.from(signature, "base64url")), true);
}

async function readJSON(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
