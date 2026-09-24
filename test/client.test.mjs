import assert from "node:assert/strict";
import { test } from "node:test";

import { AmbientAPIError, AmbientClient, commandId } from "../dist/index.js";

test("binds principal authority and maps the complete unfunded market lifecycle", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    return jsonResponse(responseFor(String(url), init.method));
  };
  const ambient = new AmbientClient({ baseURL: "https://ambient.test/", fetch });
  const session = ambient.withToken("token-1", { actorId: "agent-1" });
  const principal = session.forPrincipal("business-1", "delegation-1");

  await ambient.listMarkets({ cursor: "next cursor", limit: 25 });
  await ambient.getMarket("market/1");
  await ambient.getMarketActivity("market/1");
  await principal.createMarket({ commandId: "create-1", subject: subject("need"), mechanism: directClaim() });
  await principal.publishMarket("market/1", { commandId: "publish-1", expectedVersion: 1 });
  await principal.cancelMarket("market/1", { commandId: "cancel-1", expectedVersion: 2 });
  await principal.submitDirectClaim("market/1", { commandId: "claim-1" });
  await principal.submitSealedBid("market/1", { commandId: "bid-1", amountMinor: 5000, currency: "USD" });
  await principal.submitOffer("market/1", { commandId: "offer-1", terms: subject("offer"), amountMinor: 4200 });
  await principal.getOffers("market/1");
  await principal.withdrawOffer("market/1", { commandId: "withdraw-1", offerId: "offer-1" });
  await principal.selectOffers("market/1", { commandId: "select-1", offerIds: ["offer-1"] });
  await principal.confirmCommitment("commitment/1", { commandId: "confirm-1" });
  await principal.declineCommitment("commitment/1", { commandId: "decline-1" });
  await principal.refundCommitment("commitment/1", { commandId: "refund-1" });
  await principal.getMyOutcome("market/1");
  await principal.getMarketRecord("market/1");

  assert.deepEqual(calls.map(({ url, init }) => [new URL(url).pathname + new URL(url).search, init.method]), [
    ["/v1/markets?cursor=next+cursor&limit=25", "GET"],
    ["/v1/markets/market%2F1", "GET"],
    ["/v1/markets/market%2F1/activity", "GET"],
    ["/v1/markets", "POST"],
    ["/v1/markets/market%2F1/publish", "POST"],
    ["/v1/markets/market%2F1/cancel", "POST"],
    ["/v1/markets/market%2F1/direct-claims", "POST"],
    ["/v1/markets/market%2F1/sealed-bids", "POST"],
    ["/v1/markets/market%2F1/offers", "POST"],
    ["/v1/markets/market%2F1/offers?principalId=business-1&authorityRef=delegation-1", "GET"],
    ["/v1/markets/market%2F1/offer-withdrawals", "POST"],
    ["/v1/markets/market%2F1/offer-selections", "POST"],
    ["/v1/commitments/commitment%2F1/confirm", "POST"],
    ["/v1/commitments/commitment%2F1/decline", "POST"],
    ["/v1/commitments/commitment%2F1/refund", "POST"],
    ["/v1/markets/market%2F1/my-outcome?principalId=business-1&authorityRef=delegation-1", "GET"],
    ["/v1/markets/market%2F1/record?principalId=business-1&authorityRef=delegation-1", "GET"],
  ]);
  for (const call of calls.slice(3)) assert.equal(call.init.headers.Authorization, "Bearer token-1");
  for (const call of calls.filter(({ init }) => init.method === "POST")) {
    assert.equal(call.body.principalId, "business-1");
    assert.equal(call.body.authorityRef, "delegation-1");
  }
  assert.deepEqual(calls[3].body.funding, { mode: "none" });
});

test("supports human login and human-approved agent delegation without conflating their codes", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ path: new URL(url).pathname, authorization: init.headers.Authorization, body });
    if (new URL(url).pathname === "/v1/signup/email-challenges") return jsonResponse({ id: "login-1", email: body.email });
    if (new URL(url).pathname === "/v1/signup/email-tokens") return jsonResponse({ accessToken: "human-token", principalId: "human-1", actorId: "human-1" }, 201);
    if (new URL(url).pathname === "/v1/signup/delegation-requests") return jsonResponse({ id: "approval-1", delegationId: "delegation-1" }, 202);
    return jsonResponse({ principalId: "human-1", delegationId: "delegation-1" }, 201);
  };
  const ambient = new AmbientClient({ baseURL: "https://ambient.test", fetch });
  const request = await ambient.beginEmailLogin("person@example.com");
  const human = await ambient.completeEmailLogin(request.id, "LOGIN-CODE");
  const agent = ambient.withToken("agent-token", { actorId: "agent-1" });
  const approval = await agent.requestDelegation({
    email: "person@example.com", scopes: ["market:claim"], validUntil: "2026-10-01T00:00:00Z",
  });
  const delegated = await agent.approveDelegation(approval.id, "DELEGATION-CODE");

  assert.equal(human.principal().principalId, "human-1");
  assert.equal(delegated.principalId, "human-1");
  assert.deepEqual(calls.map(({ path }) => path), [
    "/v1/signup/email-challenges", "/v1/signup/email-tokens",
    "/v1/signup/delegation-requests", "/v1/signup/delegation-approvals",
  ]);
  assert.equal(calls[2].authorization, "Bearer agent-token");
  assert.equal(calls[3].authorization, "Bearer agent-token");
  assert.equal(calls[1].body.code, "LOGIN-CODE");
  assert.equal(calls[3].body.code, "DELEGATION-CODE");
});

test("exposes stable API errors and actor-scoped command IDs", async () => {
  assert.match(commandId("claim"), /^claim-[0-9a-f-]{36}$/);
  const ambient = new AmbientClient({
    baseURL: "https://ambient.test",
    fetch: async () => jsonResponse(
      { error: { code: "invalid_market_transition", message: "market is closed" } },
      409,
      { "X-Request-ID": "request-7" },
    ),
  });
  await assert.rejects(
    ambient.getMarket("closed"),
    (error) => error instanceof AmbientAPIError && error.status === 409 &&
      error.code === "invalid_market_transition" && error.requestId === "request-7",
  );
});

function responseFor(url, method) {
  if (method === "GET" && new URL(url).pathname === "/v1/markets") return { items: [] };
  if (method === "GET") return { market: {}, offers: [], commitments: [], integrity: {} };
  return { market: { id: "market-1", version: 1 }, events: [], commitments: [] };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function subject(value) {
  return { schema: "example.v1", data: { value } };
}

function directClaim() {
  return { presetId: "direct-claim.v1", config: { capacity: 1, pricing: { mode: "free" }, confirmation: "none" } };
}
