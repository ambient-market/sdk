import { HTTPTransport } from "./transport.js";
import type {
  AccessGrant,
  AgentIdentity,
  AgentSigner,
  AmbientClientOptions,
  ApprovedDelegation,
  CommandInput,
  CreateMarketInput,
  DelegationRequestInput,
  DirectClaimInputCommand,
  EmailRequest,
  JSONValue,
  MarketActionResult,
  MarketListPage,
  MarketRecord,
  MarketResult,
  ParticipantOutcome,
  PublicMarket,
  PublicMarketActivity,
  PublishMarketInput,
  RequestForOffersView,
  SealedBidInput,
  SelectOffersInput,
  SessionIdentity,
  SubmitOfferInput,
  VersionedCommandInput,
  WithdrawOfferInput,
} from "./types.js";

interface SignupChallenge {
  id: string;
  signingPayload: string;
}

interface AuthenticationChallenge {
  id: string;
  nonce: string;
  signingPayload: string;
}

interface EmailAccessGrant extends AccessGrant {
  principalId: string;
  actorId: string;
}

interface MarketListOptions {
  cursor?: string;
  limit?: number;
}

export class AmbientClient {
  readonly #transport: HTTPTransport;

  constructor(options: AmbientClientOptions) {
    this.#transport = new HTTPTransport(options);
  }

  async registerAgent(signer: AgentSigner): Promise<AgentIdentity> {
    requireSigner(signer);
    const challenge = await this.#transport.request<SignupChallenge>("/v1/signup/agent-challenges", {
      method: "POST", body: { publicKey: signer.publicKey },
    });
    return this.#transport.request<AgentIdentity>("/v1/signup/agents", {
      method: "POST",
      body: { challengeId: challenge.id, signature: await signer.sign(challenge.signingPayload) },
    });
  }

  async authenticateAgent(
    identity: Pick<AgentIdentity, "actorId" | "keyId"> & Partial<AgentIdentity>,
    signer: AgentSigner,
  ): Promise<AmbientSession> {
    requireSigner(signer);
    if (!identity?.actorId || !identity?.keyId) {
      throw new TypeError("identity actorId and keyId are required");
    }
    const challenge = await this.#transport.request<AuthenticationChallenge>("/v1/auth/challenges", {
      method: "POST", body: { actorId: identity.actorId, keyId: identity.keyId },
    });
    const grant = await this.#transport.request<AccessGrant>("/v1/auth/tokens", {
      method: "POST",
      body: {
        challengeId: challenge.id,
        nonce: challenge.nonce,
        signature: await signer.sign(challenge.signingPayload),
      },
    });
    return new AmbientSession(this.#transport.withToken(grant.accessToken), identity, grant);
  }

  async registerAndAuthenticateAgent(signer: AgentSigner): Promise<AmbientSession> {
    const identity = await this.registerAgent(signer);
    return this.authenticateAgent(identity, signer);
  }

  withToken(accessToken: string, identity: SessionIdentity = {}): AmbientSession {
    return new AmbientSession(this.#transport.withToken(accessToken), identity, { accessToken });
  }

  async beginEmailLogin(email: string): Promise<EmailRequest> {
    return this.#transport.request<EmailRequest>("/v1/signup/email-challenges", {
      method: "POST", body: { email: required(email, "email") },
    });
  }

  async completeEmailLogin(challengeId: string, code: string): Promise<AmbientSession> {
    const grant = await this.#transport.request<EmailAccessGrant>("/v1/signup/email-tokens", {
      method: "POST",
      body: { challengeId: required(challengeId, "challengeId"), code: required(code, "code") },
    });
    return new AmbientSession(this.#transport.withToken(grant.accessToken), {
      principalId: grant.principalId, actorId: grant.actorId,
    }, grant);
  }

  async listMarkets({ cursor, limit }: MarketListOptions = {}): Promise<MarketListPage> {
    const query = new URLSearchParams();
    if (cursor !== undefined) query.set("cursor", cursor);
    if (limit !== undefined) query.set("limit", String(limit));
    return this.#transport.request<MarketListPage>(`/v1/markets${query.size ? `?${query}` : ""}`);
  }

  getMarket(marketId: string): Promise<PublicMarket> {
    return this.#transport.request<PublicMarket>(
      `/v1/markets/${encodeURIComponent(required(marketId, "marketId"))}`,
    );
  }

  getMarketActivity(marketId: string): Promise<PublicMarketActivity> {
    return this.#transport.request<PublicMarketActivity>(
      `/v1/markets/${encodeURIComponent(required(marketId, "marketId"))}/activity`,
    );
  }
}

export class AmbientSession {
  readonly identity: SessionIdentity;
  readonly grant: AccessGrant;
  readonly accessToken: string;
  readonly #transport: HTTPTransport;

  constructor(transport: HTTPTransport, identity: SessionIdentity, grant: AccessGrant) {
    this.#transport = transport;
    this.identity = identity;
    this.grant = grant;
    this.accessToken = grant.accessToken;
  }

  principal(principalId = this.identity.principalId, authorityRef?: string): PrincipalClient {
    return this.forPrincipal(required(principalId, "principalId"), authorityRef);
  }

  forPrincipal(principalId: string, authorityRef?: string): PrincipalClient {
    return new PrincipalClient(this.#transport, required(principalId, "principalId"), authorityRef);
  }

  requestDelegation(input: DelegationRequestInput): Promise<EmailRequest> {
    if (!input || !Array.isArray(input.scopes) || input.scopes.length === 0) {
      throw new TypeError("delegation scopes are required");
    }
    return this.#transport.request<EmailRequest>("/v1/signup/delegation-requests", {
      method: "POST",
      body: {
        email: required(input.email, "email"),
        scopes: input.scopes,
        ...(input.paymentMandate === undefined ? {} : { paymentMandate: input.paymentMandate }),
        validUntil: input.validUntil,
      },
    });
  }

  approveDelegation(challengeId: string, code: string): Promise<ApprovedDelegation> {
    return this.#transport.request<ApprovedDelegation>("/v1/signup/delegation-approvals", {
      method: "POST",
      body: { challengeId: required(challengeId, "challengeId"), code: required(code, "code") },
    });
  }
}

export class PrincipalClient {
  readonly principalId: string;
  readonly authorityRef?: string;
  readonly #transport: HTTPTransport;

  constructor(transport: HTTPTransport, principalId: string, authorityRef?: string) {
    this.#transport = transport;
    this.principalId = principalId;
    this.authorityRef = authorityRef;
  }

  createMarket(input: CreateMarketInput): Promise<MarketResult> {
    const command = {
      ...input,
      funding: input?.funding ?? { mode: "none" },
    };
    return this.post<MarketResult>("/v1/markets", command);
  }

  publishMarket(marketId: string, input: PublishMarketInput): Promise<MarketResult> {
    return this.post<MarketResult>(this.marketPath(marketId, "publish"), input);
  }

  cancelMarket(marketId: string, input: VersionedCommandInput): Promise<MarketResult> {
    return this.post<MarketResult>(this.marketPath(marketId, "cancel"), input);
  }

  submitDirectClaim(marketId: string, input: DirectClaimInputCommand): Promise<MarketActionResult> {
    return this.post<MarketActionResult>(this.marketPath(marketId, "direct-claims"), input);
  }

  submitSealedBid(marketId: string, input: SealedBidInput): Promise<MarketActionResult> {
    return this.post<MarketActionResult>(this.marketPath(marketId, "sealed-bids"), input);
  }

  submitOffer(marketId: string, input: SubmitOfferInput): Promise<MarketActionResult> {
    return this.post<MarketActionResult>(this.marketPath(marketId, "offers"), input);
  }

  withdrawOffer(marketId: string, input: WithdrawOfferInput): Promise<MarketActionResult> {
    return this.post<MarketActionResult>(this.marketPath(marketId, "offer-withdrawals"), input);
  }

  selectOffers(marketId: string, input: SelectOffersInput): Promise<MarketActionResult> {
    return this.post<MarketActionResult>(this.marketPath(marketId, "offer-selections"), input);
  }

  confirmCommitment(commitmentId: string, input: CommandInput): Promise<MarketActionResult> {
    return this.post<MarketActionResult>(this.commitmentPath(commitmentId, "confirm"), input);
  }

  declineCommitment(commitmentId: string, input: CommandInput): Promise<MarketActionResult> {
    return this.post<MarketActionResult>(this.commitmentPath(commitmentId, "decline"), input);
  }

  refundCommitment(commitmentId: string, input: CommandInput): Promise<MarketActionResult> {
    return this.post<MarketActionResult>(this.commitmentPath(commitmentId, "refund"), input);
  }

  revokeDelegation(delegationId: string, input: CommandInput): Promise<JSONValue> {
    return this.post<JSONValue>(
      `/v1/delegations/${encodeURIComponent(required(delegationId, "delegationId"))}/revoke`,
      input,
    );
  }

  getOffers(marketId: string): Promise<RequestForOffersView> {
    return this.#transport.request<RequestForOffersView>(this.readPath(this.marketPath(marketId, "offers")));
  }

  getMyOutcome(marketId: string): Promise<ParticipantOutcome> {
    return this.#transport.request<ParticipantOutcome>(this.readPath(this.marketPath(marketId, "my-outcome")));
  }

  getMarketRecord(marketId: string): Promise<MarketRecord> {
    return this.#transport.request<MarketRecord>(this.readPath(this.marketPath(marketId, "record")));
  }

  private post<TResult>(path: string, input: { commandId: string }): Promise<TResult> {
    if (!input || typeof input !== "object") throw new TypeError("command input is required");
    required(input.commandId, "commandId");
    const command: Record<string, unknown> = { ...input };
    delete command.principalId;
    delete command.authorityRef;
    return this.#transport.request<TResult>(path, {
      method: "POST",
      body: {
        ...command,
        principalId: this.principalId,
        ...(this.authorityRef ? { authorityRef: this.authorityRef } : {}),
      },
    });
  }

  private readPath(path: string): string {
    const query = new URLSearchParams({ principalId: this.principalId });
    if (this.authorityRef) query.set("authorityRef", this.authorityRef);
    return `${path}?${query}`;
  }

  private marketPath(marketId: string, action: string): string {
    return `/v1/markets/${encodeURIComponent(required(marketId, "marketId"))}/${action}`;
  }

  private commitmentPath(commitmentId: string, action: string): string {
    return `/v1/commitments/${encodeURIComponent(required(commitmentId, "commitmentId"))}/${action}`;
  }
}

function requireSigner(signer: AgentSigner): void {
  if (!signer || typeof signer.publicKey !== "string" || typeof signer.sign !== "function") {
    throw new TypeError("signer must provide publicKey and sign(payload)");
  }
}

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value;
}
