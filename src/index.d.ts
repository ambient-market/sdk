export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };
export type DateInput = string | Date;

export interface AgentSigner {
  readonly publicKey: string;
  sign(encodedPayload: string): Promise<string> | string;
}

export interface AgentIdentity {
  principalId: string;
  actorId: string;
  keyId: string;
}

export interface SessionIdentity {
  principalId?: string;
  actorId?: string;
  keyId?: string;
}

export interface AccessGrant {
  accessToken: string;
  tokenType?: string;
  principalId?: string;
  actorId?: string;
  expiresAt?: string;
}

export interface Subject {
  schema: string;
  data: JSONValue;
}

export interface FulfillmentEndpoint {
  transport: string;
  uri: string;
}

export interface FulfillmentSpec {
  requestSchema: string;
  acceptedDeliveryTransports: string[];
  providerEndpoint?: FulfillmentEndpoint;
  outputMediaTypes: string[];
  slaSeconds?: number;
}

export interface FulfillmentHandoff {
  request: Subject;
  deliveryEndpoint: FulfillmentEndpoint;
}

export type FundingPolicy =
  | { mode: "none" }
  | { mode: "reserve_on_submission"; acceptedRailIds: string[]; settlementGraceSeconds: number };

export interface MechanismSelection<TPreset extends string = string, TConfig extends object = Record<string, never>> {
  presetId: TPreset;
  config: TConfig;
}

export type ConfirmationPolicy = "none" | "creator" | "participant" | "both";
export type DirectClaimPricing =
  | { mode: "free" }
  | { mode: "posted"; amountMinor: number; currency: string };

export interface DirectClaimInput {
  capacity: number;
  pricing?: DirectClaimPricing;
  confirmation?: ConfirmationPolicy;
  holdDurationSeconds?: number;
}

export interface DirectClaimConfig {
  capacity: number;
  pricing: DirectClaimPricing;
  confirmation: ConfirmationPolicy;
  holdDurationSeconds?: number;
}

export interface SealedAuctionInput {
  currency: string;
  reserveAmountMinor?: number;
  closesAt: DateInput;
  holdDurationSeconds: number;
  resolutionDeadline?: DateInput;
}

export interface SealedAuctionConfig {
  currency: string;
  reserveAmountMinor?: number;
  closesAt: string;
  holdDurationSeconds: number;
  resolutionDeadline?: string;
}

export type RequestForOffersPricing =
  | { mode: "none" }
  | { mode: "optional" | "required"; currency: string; maximumAmountMinor?: number };

export interface RequestForOffersInput {
  capacity: number;
  offerSchema: string;
  offersCloseAt: DateInput;
  selectionClosesAt: DateInput;
  pricing?: RequestForOffersPricing;
}

export interface RequestForOffersConfig {
  capacity: number;
  offerSchema: string;
  offersCloseAt: string;
  selectionClosesAt: string;
  selectionTiming: "after_deadline";
  pricing: RequestForOffersPricing;
}

export const mechanisms: Readonly<{
  directClaim(input: DirectClaimInput): MechanismSelection<"direct-claim.v1", DirectClaimConfig>;
  sealedAuction(input: SealedAuctionInput): MechanismSelection<"sealed-forward-auction.v1", SealedAuctionConfig>;
  requestForOffers(input: RequestForOffersInput): MechanismSelection<"request-for-offers.v1", RequestForOffersConfig>;
}>;

export interface CommandIdentity {
  principalId: string;
  actorId: string;
  authorityRef?: string;
}

export interface PaymentCredentialInstruction {
  railId: string;
  credentialType: string;
  credentialTarget: string;
}

export interface Market {
  id: string;
  externalRef?: string;
  discoverability: "listed" | "unlisted";
  version: number;
  state: "draft" | "open" | "closed" | "canceled";
  creator: CommandIdentity;
  subject: Subject;
  fulfillment?: FulfillmentSpec;
  mechanism: MechanismSelection<string, Record<string, JSONValue>>;
  mechanismState: JSONValue;
  funding: FundingPolicy;
  paymentCredentialInstructions?: PaymentCredentialInstruction[];
  publicationCredentialId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicMarket extends Omit<Market, "creator" | "externalRef" | "publicationCredentialId"> {
  creatorPrincipalId: string;
  publicationVerified: boolean;
}

export interface Event {
  sequence?: number;
  id: string;
  type: string;
  marketId: string;
  marketVersion: number;
  commandId: string;
  principalId: string;
  actorId: string;
  authorityRef?: string;
  occurredAt: string;
  data: JSONValue;
}

export interface Commitment {
  id: string;
  version: number;
  marketId: string;
  marketVersion: number;
  creatorPrincipalId: string;
  participantPrincipalId: string;
  paymentAuthorizationId?: string;
  settlementState?: "pending" | "settled" | "failed";
  settlementOperationId?: string;
  settlementFailureCode?: string;
  refundState?: "pending" | "refunded" | "failed";
  refundOperationId?: string;
  refundFailureCode?: string;
  state: "provisional" | "awaiting_confirmations" | "committed" | "declined" | "expired" | "failed";
  terms: JSONValue;
  requiredConfirmationPrincipalIds?: string[];
  confirmedPrincipalIds?: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BidReceipt {
  bidId: string;
  marketId: string;
  marketVersion: number;
  state: "active";
  submittedAt: string;
}

export interface OfferReceipt {
  offerId: string;
  marketId: string;
  marketVersion: number;
  state: OfferState;
  submittedAt: string;
}

export type OfferState = "active" | "withdrawn" | "selected" | "not_selected" | "expired";

export interface MarketResult {
  market: Market;
  events: Event[];
}

export interface MarketActionResult extends MarketResult {
  commitments: Commitment[];
  bidReceipts?: BidReceipt[];
  offerReceipts?: OfferReceipt[];
  auctionResolution?: JSONValue;
  requestForOffersResolution?: JSONValue;
}

export interface MarketListPage {
  items: PublicMarket[];
  nextCursor?: string;
}

export interface PublicMarketActivity {
  marketId: string;
  items: Array<{
    sequence: number;
    type: string;
    marketVersion: number;
    occurredAt: string;
    data?: JSONValue;
  }>;
}

export interface ParticipantOutcome {
  market: PublicMarket;
  bidReceipts: BidReceipt[];
  offers: Array<{ id: string; state: OfferState; submittedAt: string; updatedAt: string }>;
  commitments: Commitment[];
}

export interface OfferView {
  id: string;
  providerPrincipalId: string;
  terms: Subject;
  amountMinor?: number;
  state: OfferState;
  submittedAt: string;
  updatedAt: string;
}

export interface RequestForOffersView {
  market: PublicMarket;
  offers: OfferView[];
}

export interface MarketRecord {
  market: Market;
  commands: JSONValue[];
  commitments: Commitment[];
  privateOffers?: JSONValue[];
  events: Event[];
  integrity: { algorithm: string; recordHash: string; stateReconstructed: boolean };
}

export interface CreateMarketInput {
  commandId: string;
  externalRef?: string;
  discoverability?: "listed" | "unlisted";
  subject: Subject;
  fulfillment?: FulfillmentSpec;
  mechanism: MechanismSelection<string, object>;
  funding?: FundingPolicy;
}

export interface VersionedCommandInput { commandId: string; expectedVersion: number }
export interface PublishMarketInput extends VersionedCommandInput { credentialId?: string }
export interface DirectClaimInputCommand {
  commandId: string;
  expectedVersion?: number;
  paymentAuthorizationId?: string;
  fulfillment?: FulfillmentHandoff;
}
export interface SealedBidInput { commandId: string; amountMinor: number; currency: string; paymentAuthorizationId?: string }
export interface SubmitOfferInput { commandId: string; terms: Subject; amountMinor?: number }
export interface WithdrawOfferInput { commandId: string; offerId: string }
export interface SelectOffersInput { commandId: string; offerIds: string[] }
export interface CommandInput { commandId: string }

export type AuthorityScope =
  | "market:create" | "market:publish" | "market:cancel" | "market:claim" | "market:bid"
  | "market:offer_submit" | "market:offer_select" | "commitment:confirm" | "commitment:decline"
  | "commitment:refund" | "credential:issue" | "payment:authorize" | "payment:register_payee_rail";

export interface PaymentMandate {
  railId: string;
  currency: string;
  maxAmountMinor: number;
  payeePrincipalId?: string;
  marketId?: string;
}

export interface DelegationRequestInput {
  email: string;
  scopes: AuthorityScope[];
  paymentMandate?: PaymentMandate;
  validUntil: DateInput;
}

export interface EmailRequest {
  id: string;
  email: string;
  delegationId?: string;
  expiresAt: string;
}

export interface ApprovedDelegation { principalId: string; delegationId: string }

export interface AmbientClientOptions {
  baseURL: string;
  fetch?: typeof globalThis.fetch;
  accessToken?: string;
}

export class AmbientClient {
  constructor(options: AmbientClientOptions);
  registerAgent(signer: AgentSigner): Promise<AgentIdentity>;
  authenticateAgent(identity: Pick<AgentIdentity, "actorId" | "keyId"> & Partial<AgentIdentity>, signer: AgentSigner): Promise<AmbientSession>;
  registerAndAuthenticateAgent(signer: AgentSigner): Promise<AmbientSession>;
  withToken(accessToken: string, identity?: SessionIdentity): AmbientSession;
  beginEmailLogin(email: string): Promise<EmailRequest>;
  completeEmailLogin(challengeId: string, code: string): Promise<AmbientSession>;
  listMarkets(options?: { cursor?: string; limit?: number }): Promise<MarketListPage>;
  getMarket(marketId: string): Promise<PublicMarket>;
  getMarketActivity(marketId: string): Promise<PublicMarketActivity>;
}

export class AmbientSession {
  readonly identity: SessionIdentity;
  readonly grant: AccessGrant;
  readonly accessToken: string;
  principal(principalId?: string, authorityRef?: string): PrincipalClient;
  forPrincipal(principalId: string, authorityRef?: string): PrincipalClient;
  requestDelegation(input: DelegationRequestInput): Promise<EmailRequest>;
  approveDelegation(challengeId: string, code: string): Promise<ApprovedDelegation>;
}

export class PrincipalClient {
  readonly principalId: string;
  readonly authorityRef?: string;
  createMarket(input: CreateMarketInput): Promise<MarketResult>;
  publishMarket(marketId: string, input: PublishMarketInput): Promise<MarketResult>;
  cancelMarket(marketId: string, input: VersionedCommandInput): Promise<MarketResult>;
  submitDirectClaim(marketId: string, input: DirectClaimInputCommand): Promise<MarketActionResult>;
  submitSealedBid(marketId: string, input: SealedBidInput): Promise<MarketActionResult>;
  submitOffer(marketId: string, input: SubmitOfferInput): Promise<MarketActionResult>;
  withdrawOffer(marketId: string, input: WithdrawOfferInput): Promise<MarketActionResult>;
  selectOffers(marketId: string, input: SelectOffersInput): Promise<MarketActionResult>;
  confirmCommitment(commitmentId: string, input: CommandInput): Promise<MarketActionResult>;
  declineCommitment(commitmentId: string, input: CommandInput): Promise<MarketActionResult>;
  refundCommitment(commitmentId: string, input: CommandInput): Promise<MarketActionResult>;
  revokeDelegation(delegationId: string, input: CommandInput): Promise<JSONValue>;
  getOffers(marketId: string): Promise<RequestForOffersView>;
  getMyOutcome(marketId: string): Promise<ParticipantOutcome>;
  getMarketRecord(marketId: string): Promise<MarketRecord>;
}

export interface AmbientAPIErrorOptions {
  status?: number;
  code?: string;
  requestId?: string;
  details?: unknown;
}

export class AmbientAPIError extends Error {
  constructor(message: string, options?: AmbientAPIErrorOptions);
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: unknown;
}

export function commandId(prefix?: string): string;
