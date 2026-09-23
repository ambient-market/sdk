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

  async beginEmailLogin(email) {
    return this.transport.request("/v1/signup/email-challenges", {
      method: "POST", body: { email: required(email, "email") },
    });
  }

  async completeEmailLogin(challengeId, code) {
    const grant = await this.transport.request("/v1/signup/email-tokens", {
      method: "POST",
      body: { challengeId: required(challengeId, "challengeId"), code: required(code, "code") },
    });
    return new AmbientSession(this.transport.withToken(grant.accessToken), {
      principalId: grant.principalId, actorId: grant.actorId,
    }, grant);
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

  requestDelegation(input) {
    if (!input || !Array.isArray(input.scopes) || input.scopes.length === 0) throw new TypeError("delegation scopes are required");
    return this.transport.request("/v1/signup/delegation-requests", {
      method: "POST",
      body: {
        email: required(input.email, "email"),
        scopes: input.scopes,
        ...(input.paymentMandate === undefined ? {} : { paymentMandate: input.paymentMandate }),
        validUntil: required(input.validUntil, "validUntil"),
      },
    });
  }

  approveDelegation(challengeId, code) {
    return this.transport.request("/v1/signup/delegation-approvals", {
      method: "POST",
      body: { challengeId: required(challengeId, "challengeId"), code: required(code, "code") },
    });
  }
}

export class PrincipalClient {
  constructor(transport, principalId, authorityRef) {
    this.transport = transport;
    this.principalId = principalId;
    this.authorityRef = authorityRef;
  }

  createMarket(input) {
    return this.post("/v1/markets", {
      ...input,
      funding: input?.funding ?? { mode: "none" },
    });
  }

  publishMarket(marketId, input) {
    return this.post(this.marketPath(marketId, "publish"), input);
  }

  cancelMarket(marketId, input) {
    return this.post(this.marketPath(marketId, "cancel"), input);
  }

  submitDirectClaim(marketId, input) {
    return this.post(this.marketPath(marketId, "direct-claims"), input);
  }

  submitSealedBid(marketId, input) {
    return this.post(this.marketPath(marketId, "sealed-bids"), input);
  }

  submitOffer(marketId, input) {
    return this.post(this.marketPath(marketId, "offers"), input);
  }

  withdrawOffer(marketId, input) {
    return this.post(this.marketPath(marketId, "offer-withdrawals"), input);
  }

  selectOffers(marketId, input) {
    return this.post(this.marketPath(marketId, "offer-selections"), input);
  }

  confirmCommitment(commitmentId, input) {
    return this.post(this.commitmentPath(commitmentId, "confirm"), input);
  }

  declineCommitment(commitmentId, input) {
    return this.post(this.commitmentPath(commitmentId, "decline"), input);
  }

  refundCommitment(commitmentId, input) {
    return this.post(this.commitmentPath(commitmentId, "refund"), input);
  }

  revokeDelegation(delegationId, input) {
    return this.post(`/v1/delegations/${encodeURIComponent(required(delegationId, "delegationId"))}/revoke`, input);
  }

  getOffers(marketId) {
    return this.transport.request(this.readPath(this.marketPath(marketId, "offers")));
  }

  getMyOutcome(marketId) {
    return this.transport.request(this.readPath(this.marketPath(marketId, "my-outcome")));
  }

  getMarketRecord(marketId) {
    return this.transport.request(this.readPath(this.marketPath(marketId, "record")));
  }

  post(path, input) {
    if (!input || typeof input !== "object") throw new TypeError("command input is required");
    required(input.commandId, "commandId");
    const { principalId: _ignoredPrincipal, authorityRef: _ignoredAuthority, ...command } = input;
    return this.transport.request(path, {
      method: "POST",
      body: {
        ...command,
        principalId: this.principalId,
        ...(this.authorityRef ? { authorityRef: this.authorityRef } : {}),
      },
    });
  }

  readPath(path) {
    const query = new URLSearchParams({ principalId: this.principalId });
    if (this.authorityRef) query.set("authorityRef", this.authorityRef);
    return `${path}?${query}`;
  }

  marketPath(marketId, action) {
    return `/v1/markets/${encodeURIComponent(required(marketId, "marketId"))}/${action}`;
  }

  commitmentPath(commitmentId, action) {
    return `/v1/commitments/${encodeURIComponent(required(commitmentId, "commitmentId"))}/${action}`;
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
