const confirmationPolicies = new Set(["none", "creator", "participant", "both"]);
const pricingModes = new Set(["none", "optional", "required"]);

export const mechanisms = Object.freeze({
  directClaim(input) {
    requirePositiveInteger(input?.capacity, "capacity");
    const confirmation = input.confirmation ?? "none";
    if (!confirmationPolicies.has(confirmation)) throw new TypeError("confirmation is invalid");
    const pricing = input.pricing ?? { mode: "free" };
    if (pricing.mode !== "free" && pricing.mode !== "posted") throw new TypeError("pricing mode is invalid");
    if (pricing.mode === "posted") {
      requirePositiveInteger(pricing.amountMinor, "pricing.amountMinor");
      requireCurrency(pricing.currency);
    } else if (pricing.amountMinor !== undefined || pricing.currency !== undefined) {
      throw new TypeError("free pricing cannot include amountMinor or currency");
    }
    if (confirmation !== "none") requirePositiveInteger(input.holdDurationSeconds, "holdDurationSeconds");
    const config = { capacity: input.capacity, pricing: { ...pricing }, confirmation };
    if (input.holdDurationSeconds !== undefined) config.holdDurationSeconds = input.holdDurationSeconds;
    return { presetId: "direct-claim.v1", config };
  },

  sealedAuction(input) {
    requireCurrency(input?.currency);
    const closesAt = dateTime(input.closesAt, "closesAt");
    requirePositiveInteger(input.holdDurationSeconds, "holdDurationSeconds");
    if (input.reserveAmountMinor !== undefined) requirePositiveInteger(input.reserveAmountMinor, "reserveAmountMinor");
    const config = { currency: input.currency };
    if (input.reserveAmountMinor !== undefined) config.reserveAmountMinor = input.reserveAmountMinor;
    config.closesAt = closesAt;
    config.holdDurationSeconds = input.holdDurationSeconds;
    if (input.resolutionDeadline !== undefined) {
      config.resolutionDeadline = dateTime(input.resolutionDeadline, "resolutionDeadline");
      if (Date.parse(config.resolutionDeadline) <= Date.parse(closesAt)) throw new TypeError("resolutionDeadline must be after closesAt");
    }
    return { presetId: "sealed-forward-auction.v1", config };
  },

  requestForOffers(input) {
    requirePositiveInteger(input?.capacity, "capacity");
    if (typeof input.offerSchema !== "string" || input.offerSchema.trim() === "") throw new TypeError("offerSchema is required");
    const offersCloseAt = dateTime(input.offersCloseAt, "offersCloseAt");
    const selectionClosesAt = dateTime(input.selectionClosesAt, "selectionClosesAt");
    if (Date.parse(selectionClosesAt) <= Date.parse(offersCloseAt)) throw new TypeError("selectionClosesAt must be after offersCloseAt");
    const pricing = input.pricing ?? { mode: "none" };
    if (!pricingModes.has(pricing.mode)) throw new TypeError("pricing mode is invalid");
    if (pricing.mode === "none") {
      if (pricing.currency !== undefined || pricing.maximumAmountMinor !== undefined) throw new TypeError("pricing none cannot include currency or maximumAmountMinor");
    } else {
      requireCurrency(pricing.currency);
      if (pricing.maximumAmountMinor !== undefined) requirePositiveInteger(pricing.maximumAmountMinor, "pricing.maximumAmountMinor");
    }
    return {
      presetId: "request-for-offers.v1",
      config: {
        capacity: input.capacity,
        offerSchema: input.offerSchema.trim(),
        offersCloseAt,
        selectionClosesAt,
        selectionTiming: "after_deadline",
        pricing: { ...pricing },
      },
    };
  },
});

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
}

function requireCurrency(value) {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw new TypeError("currency must be a three-letter uppercase code");
}

function dateTime(value, name) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid date-time`);
  return date.toISOString();
}

