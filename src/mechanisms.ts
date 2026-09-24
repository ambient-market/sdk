import type {
  ConfirmationPolicy,
  DateInput,
  DirectClaimConfig,
  DirectClaimInput,
  DirectClaimPricing,
  MechanismSelection,
  RequestForOffersConfig,
  RequestForOffersInput,
  RequestForOffersPricing,
  SealedAuctionConfig,
  SealedAuctionInput,
} from "./types.js";

const confirmationPolicies: ReadonlySet<string> = new Set(["none", "creator", "participant", "both"]);
const pricingModes: ReadonlySet<string> = new Set(["none", "optional", "required"]);

export const mechanisms = Object.freeze({
  directClaim(input: DirectClaimInput): MechanismSelection<"direct-claim.v1", DirectClaimConfig> {
    requireInput(input);
    requirePositiveInteger(input.capacity, "capacity");
    const confirmation = input.confirmation ?? "none";
    if (!confirmationPolicies.has(confirmation)) throw new TypeError("confirmation is invalid");
    const pricing = (input.pricing ?? { mode: "free" }) as DirectClaimPricing & {
      amountMinor?: unknown;
      currency?: unknown;
    };
    if (pricing.mode !== "free" && pricing.mode !== "posted") throw new TypeError("pricing mode is invalid");
    if (pricing.mode === "posted") {
      requirePositiveInteger(pricing.amountMinor, "pricing.amountMinor");
      requireCurrency(pricing.currency);
    } else if (pricing.amountMinor !== undefined || pricing.currency !== undefined) {
      throw new TypeError("free pricing cannot include amountMinor or currency");
    }
    if (confirmation !== "none") requirePositiveInteger(input.holdDurationSeconds, "holdDurationSeconds");
    const config: DirectClaimConfig = {
      capacity: input.capacity,
      pricing: pricing as DirectClaimPricing,
      confirmation: confirmation as ConfirmationPolicy,
    };
    if (input.holdDurationSeconds !== undefined) config.holdDurationSeconds = input.holdDurationSeconds;
    return { presetId: "direct-claim.v1", config };
  },

  sealedAuction(input: SealedAuctionInput): MechanismSelection<"sealed-forward-auction.v1", SealedAuctionConfig> {
    requireInput(input);
    requireCurrency(input.currency);
    const closesAt = dateTime(input.closesAt, "closesAt");
    requirePositiveInteger(input.holdDurationSeconds, "holdDurationSeconds");
    if (input.reserveAmountMinor !== undefined) requirePositiveInteger(input.reserveAmountMinor, "reserveAmountMinor");
    const config: SealedAuctionConfig = {
      currency: input.currency,
      closesAt,
      holdDurationSeconds: input.holdDurationSeconds,
    };
    if (input.reserveAmountMinor !== undefined) config.reserveAmountMinor = input.reserveAmountMinor;
    if (input.resolutionDeadline !== undefined) {
      config.resolutionDeadline = dateTime(input.resolutionDeadline, "resolutionDeadline");
      if (Date.parse(config.resolutionDeadline) <= Date.parse(closesAt)) {
        throw new TypeError("resolutionDeadline must be after closesAt");
      }
    }
    return { presetId: "sealed-forward-auction.v1", config };
  },

  requestForOffers(input: RequestForOffersInput): MechanismSelection<"request-for-offers.v1", RequestForOffersConfig> {
    requireInput(input);
    requirePositiveInteger(input.capacity, "capacity");
    if (typeof input.offerSchema !== "string" || input.offerSchema.trim() === "") {
      throw new TypeError("offerSchema is required");
    }
    const offersCloseAt = dateTime(input.offersCloseAt, "offersCloseAt");
    const selectionClosesAt = dateTime(input.selectionClosesAt, "selectionClosesAt");
    if (Date.parse(selectionClosesAt) <= Date.parse(offersCloseAt)) {
      throw new TypeError("selectionClosesAt must be after offersCloseAt");
    }
    const pricing = (input.pricing ?? { mode: "none" }) as RequestForOffersPricing & {
      currency?: unknown;
      maximumAmountMinor?: unknown;
    };
    if (!pricingModes.has(pricing.mode)) throw new TypeError("pricing mode is invalid");
    if (pricing.mode === "none") {
      if (pricing.currency !== undefined || pricing.maximumAmountMinor !== undefined) {
        throw new TypeError("pricing none cannot include currency or maximumAmountMinor");
      }
    } else {
      requireCurrency(pricing.currency);
      if (pricing.maximumAmountMinor !== undefined) {
        requirePositiveInteger(pricing.maximumAmountMinor, "pricing.maximumAmountMinor");
      }
    }
    return {
      presetId: "request-for-offers.v1",
      config: {
        capacity: input.capacity,
        offerSchema: input.offerSchema.trim(),
        offersCloseAt,
        selectionClosesAt,
        selectionTiming: "after_deadline",
        pricing: pricing as RequestForOffersPricing,
      },
    };
  },
});

function requireInput(value: unknown): asserts value is object {
  if (!value || typeof value !== "object") throw new TypeError("mechanism input is required");
}

function requirePositiveInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function requireCurrency(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new TypeError("currency must be a three-letter uppercase code");
  }
}

function dateTime(value: DateInput, name: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid date-time`);
  return date.toISOString();
}
