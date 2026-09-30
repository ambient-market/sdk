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
  claimsCloseAt?: DateInput;
}

export interface DirectClaimConfig {
  capacity: number;
  pricing: DirectClaimPricing;
  confirmation: ConfirmationPolicy;
  holdDurationSeconds?: number;
  claimsCloseAt?: string;
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

type LotterySettings<TDate> = {
  capacity: number;
  entryClosesAt: TDate;
  /** Described conditions for creator review; not evaluated by the SDK or kernel. */
  eligibilityTerms?: string;
} & (
  | { confirmation?: "none"; confirmationWindowSeconds?: never; resolutionDeadline?: never }
  | { confirmation: "creator"; confirmationWindowSeconds: number; resolutionDeadline: TDate }
);
export type LotteryInput = LotterySettings<DateInput>;
export type LotteryConfig = LotterySettings<string> & { confirmation: "none" | "creator" };

export interface LotteryEntryView {
  id: string;
  evidenceUrl?: string;
  /** Active means not withdrawn, not that this entry won. */
  state: "active" | "withdrawn";
  submittedAt: string;
  updatedAt: string;
}

export interface LotteryReviewView {
  market: PublicMarket;
  /** Only already selected candidates, including completed reviews. */
  candidates: Array<{ entry: LotteryEntryView; commitment: Commitment }>;
}

export interface LotteryDraw {
  algorithm: string;
  seed: string;
  entrySetDigest: string;
  orderedEntryIds: string[];
}

export interface PrivateLotteryEntry extends LotteryEntryView {
  marketId: string;
  marketVersion: number;
  identity: CommandIdentity;
}

export interface CommandIdentity {
  principalId: string;
  actorId: string;
  authorityRef?: string;
}

/** Creator actor/delegation metadata is redacted in lottery action responses. */
export interface MarketCreator {
  principalId: string;
  actorId?: string;
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
  creator: MarketCreator;
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
  /** Own entry history. An empty commitment list is not a final loss before resolution. */
  lotteryEntries?: LotteryEntryView[];
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
  /** Creator-only audit material, never returned by candidate review or own outcome. */
  privateLotteryEntries?: PrivateLotteryEntry[];
  privateLotteryDraw?: LotteryDraw;
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
export interface CloseDirectClaimsInput { commandId: string }
export interface SealedBidInput { commandId: string; amountMinor: number; currency: string; paymentAuthorizationId?: string }
export interface SubmitOfferInput { commandId: string; terms: Subject; amountMinor?: number }
export interface WithdrawOfferInput { commandId: string; offerId: string }
export interface SelectOffersInput { commandId: string; offerIds: string[] }
export interface CommandInput { commandId: string }
export interface EnterLotteryInput extends CommandInput { evidenceUrl?: string }
export interface WithdrawLotteryEntryInput extends CommandInput { entryId: string }
export interface DeclineCommitmentInput extends CommandInput {
  /** Required for lottery creator review; optional for other presets. */
  reason?: string;
}

export type AuthorityScope =
  | "market:lottery_enter"
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

export interface IssueDelegationInput {
  commandId: string;
  delegationId: string;
  delegateActorId: string;
  scopes: AuthorityScope[];
  paymentMandate?: PaymentMandate;
  validUntil?: DateInput;
}

export interface Delegation {
  id: string;
  principalId: string;
  actorId: string;
  scopes: AuthorityScope[];
  paymentMandate?: PaymentMandate;
  validFrom: string;
  validUntil?: string;
  revokedAt?: string;
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

export interface AmbientAPIErrorOptions {
  status?: number;
  code?: string;
  requestId?: string;
  details?: unknown;
}
