import { HTTPTransport } from "./transport.js";

export class AmbientClient {
  constructor(options) {
    this.transport = new HTTPTransport(options);
  }

  async registerAgent(signer) {
    requireSigner(signer);
    const challenge = await this.transport.request("/v1/signup/agent-challenges", {
      method: "POST", body: { publicKey: signer.publicKey },
    });
    return this.transport.request("/v1/signup/agents", {
      method: "POST",
      body: { challengeId: challenge.id, signature: await signer.sign(challenge.signingPayload) },
    });
  }

  async authenticateAgent(identity, signer) {
    requireSigner(signer);
    if (!identity?.actorId || !identity?.keyId) throw new TypeError("identity actorId and keyId are required");
    const challenge = await this.transport.request("/v1/auth/challenges", {
      method: "POST", body: { actorId: identity.actorId, keyId: identity.keyId },
    });
    const grant = await this.transport.request("/v1/auth/tokens", {
      method: "POST",
      body: {
        challengeId: challenge.id,
        nonce: challenge.nonce,
        signature: await signer.sign(challenge.signingPayload),
      },
    });
    return new AmbientSession(this.transport.withToken(grant.accessToken), identity, grant);
  }

  async registerAndAuthenticateAgent(signer) {
    const identity = await this.registerAgent(signer);
    return this.authenticateAgent(identity, signer);
  }

  withToken(accessToken, identity = {}) {
    return new AmbientSession(this.transport.withToken(accessToken), identity, { accessToken });
  }

  async listMarkets({ cursor, limit } = {}) {
    const query = new URLSearchParams();
    if (cursor !== undefined) query.set("cursor", cursor);
    if (limit !== undefined) query.set("limit", String(limit));
    return this.transport.request(`/v1/markets${query.size ? `?${query}` : ""}`);
  }

  getMarket(marketId) {
    return this.transport.request(`/v1/markets/${encodeURIComponent(required(marketId, "marketId"))}`);
  }

  getMarketActivity(marketId) {
    return this.transport.request(`/v1/markets/${encodeURIComponent(required(marketId, "marketId"))}/activity`);
  }
}

export class AmbientSession {
  constructor(transport, identity, grant) {
    this.transport = transport;
    this.identity = identity;
    this.grant = grant;
    this.accessToken = grant.accessToken;
  }

  principal(principalId = this.identity.principalId, authorityRef) {
    return this.forPrincipal(principalId, authorityRef);
  }

  forPrincipal(principalId, authorityRef) {
    return new PrincipalClient(this.transport, required(principalId, "principalId"), authorityRef);
  }
}

export class PrincipalClient {
  constructor(transport, principalId, authorityRef) {
    this.transport = transport;
    this.principalId = principalId;
    this.authorityRef = authorityRef;
  }
}

function requireSigner(signer) {
  if (!signer || typeof signer.publicKey !== "string" || typeof signer.sign !== "function") {
    throw new TypeError("signer must provide publicKey and sign(payload)");
  }
}

function required(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value;
}

