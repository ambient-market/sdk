import assert from "node:assert/strict";
import { test } from "node:test";

import { mechanisms } from "../src/index.js";

test("builds explicit launch mechanism configurations without hiding market rules", () => {
  assert.deepEqual(mechanisms.directClaim({ capacity: 2, confirmation: "creator", holdDurationSeconds: 600 }), {
    presetId: "direct-claim.v1",
    config: { capacity: 2, pricing: { mode: "free" }, confirmation: "creator", holdDurationSeconds: 600 },
  });
  assert.deepEqual(mechanisms.sealedAuction({
    currency: "USD", reserveAmountMinor: 5000,
    closesAt: "2026-10-02T20:00:00Z", holdDurationSeconds: 600,
  }), {
    presetId: "sealed-forward-auction.v1",
    config: {
      currency: "USD", reserveAmountMinor: 5000,
      closesAt: "2026-10-02T20:00:00.000Z", holdDurationSeconds: 600,
    },
  });
  assert.deepEqual(mechanisms.requestForOffers({
    capacity: 1, offerSchema: "service-offer.v1",
    offersCloseAt: "2026-10-02T20:00:00Z",
    selectionClosesAt: "2026-10-02T21:00:00Z",
    pricing: { mode: "required", currency: "USD", maximumAmountMinor: 10000 },
  }), {
    presetId: "request-for-offers.v1",
    config: {
      capacity: 1, offerSchema: "service-offer.v1",
      offersCloseAt: "2026-10-02T20:00:00.000Z",
      selectionClosesAt: "2026-10-02T21:00:00.000Z",
      selectionTiming: "after_deadline",
      pricing: { mode: "required", currency: "USD", maximumAmountMinor: 10000 },
    },
  });
});

test("rejects SDK inputs that cannot become valid market rules", () => {
  assert.throws(() => mechanisms.directClaim({ capacity: 0 }), /capacity/);
  assert.throws(() => mechanisms.sealedAuction({ currency: "usd", closesAt: new Date(), holdDurationSeconds: 1 }), /currency/);
  assert.throws(() => mechanisms.requestForOffers({
    capacity: 1, offerSchema: "offer.v1",
    offersCloseAt: "2026-10-02T21:00:00Z",
    selectionClosesAt: "2026-10-02T20:00:00Z",
    pricing: { mode: "none" },
  }), /selectionClosesAt/);
});
