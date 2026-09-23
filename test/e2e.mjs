import assert from "node:assert/strict";

import { AmbientClient, commandId, mechanisms } from "../src/index.js";
import { NodeAgentKey } from "../src/node.js";

const baseURL = process.env.AMBIENT_BASE_URL;
if (!baseURL) throw new Error("AMBIENT_BASE_URL is required");

const ambient = new AmbientClient({ baseURL });
const [creatorSession, firstSession, secondSession] = await Promise.all([
  actor(), actor(), actor(),
]);
const creator = creatorSession.principal();
const first = firstSession.principal();
const second = secondSession.principal();

await directClaimLifecycle();
await sealedAuctionLifecycle();
await requestForOffersLifecycle();
console.log("Ambient JavaScript SDK completed all deployed lifecycles.");

async function actor() {
  return ambient.registerAndAuthenticateAgent(NodeAgentKey.generate());
}

async function directClaimLifecycle() {
  const created = await creator.createMarket({
    commandId: commandId("sdk-direct-create"),
    externalRef: commandId("sdk-direct"),
    subject: subject("sdk.direct-claim.v1", { title: "SDK direct claim" }),
    fulfillment: {
      requestSchema: "sdk.work-request.v1",
      acceptedDeliveryTransports: ["https"],
      providerEndpoint: { transport: "https", uri: "https://provider.example/work" },
      outputMediaTypes: ["application/json"],
      slaSeconds: 3_600,
    },
    mechanism: mechanisms.directClaim({ capacity: 1 }),
  });
  const published = await creator.publishMarket(created.market.id, {
    commandId: commandId("sdk-direct-publish"), expectedVersion: created.market.version,
  });
  assert.equal(published.market.state, "open");
  const discovered = await ambient.listMarkets({ limit: 100 });
  assert(discovered.items.some(({ id }) => id === created.market.id));

  const claimed = await first.submitDirectClaim(created.market.id, {
    commandId: commandId("sdk-direct-claim"),
    fulfillment: {
      request: subject("sdk.work-request.v1", { brief: "Run the integration" }),
      deliveryEndpoint: { transport: "https", uri: "https://buyer.example/results" },
    },
  });
  assert.equal(claimed.commitments.length, 1);
  assert.equal(claimed.commitments[0].state, "committed");
  assert.equal(claimed.commitments[0].terms.fulfillment.spec.slaSeconds, 3_600);
  assert.equal(
    claimed.commitments[0].terms.fulfillment.handoff.deliveryEndpoint.uri,
    "https://buyer.example/results",
  );
  const outcome = await first.getMyOutcome(created.market.id);
  assert.equal(outcome.commitments[0].id, claimed.commitments[0].id);
  const activity = await ambient.getMarketActivity(created.market.id);
  assert.equal(JSON.stringify(activity).includes("buyer.example"), false);
  const record = await creator.getMarketRecord(created.market.id);
  assert.equal(record.integrity.stateReconstructed, true);
  assert.equal(
    record.commitments[0].terms.fulfillment.handoff.request.data.brief,
    "Run the integration",
  );
}

async function sealedAuctionLifecycle() {
  const created = await creator.createMarket({
    commandId: commandId("sdk-auction-create"),
    externalRef: commandId("sdk-auction"),
    subject: subject("sdk.auction.v1", { title: "SDK sealed auction" }),
    mechanism: mechanisms.sealedAuction({
      currency: "USD", closesAt: new Date(Date.now() + 3_000), holdDurationSeconds: 30,
    }),
  });
  await creator.publishMarket(created.market.id, {
    commandId: commandId("sdk-auction-publish"), expectedVersion: created.market.version,
  });
  const firstBid = await first.submitSealedBid(created.market.id, {
    commandId: commandId("sdk-auction-bid"), amountMinor: 8_800, currency: "USD",
  });
  const secondBid = await second.submitSealedBid(created.market.id, {
    commandId: commandId("sdk-auction-bid"), amountMinor: 7_200, currency: "USD",
  });
  assert.equal(firstBid.bidReceipts.length, 1);
  assert.equal(secondBid.bidReceipts.length, 1);
  assert.equal(firstBid.bidReceipts[0].amountMinor, undefined);

  const winnerOutcome = await waitFor(async () => {
    const outcome = await first.getMyOutcome(created.market.id);
    return outcome.commitments.length === 1 ? outcome : undefined;
  }, "auction resolution");
  const loserOutcome = await second.getMyOutcome(created.market.id);
  assert.equal(loserOutcome.bidReceipts.length, 1);
  assert.equal(loserOutcome.commitments.length, 0);
  const confirmed = await first.confirmCommitment(winnerOutcome.commitments[0].id, {
    commandId: commandId("sdk-auction-confirm"),
  });
  assert.equal(confirmed.commitments[0].state, "committed");
  const record = await creator.getMarketRecord(created.market.id);
  assert.equal(record.commitments[0].participantPrincipalId, first.principalId);
  assert.equal(record.commitments[0].state, "committed");
}

async function requestForOffersLifecycle() {
  const offersCloseAt = new Date(Date.now() + 4_000);
  const created = await creator.createMarket({
    commandId: commandId("sdk-rfo-create"),
    externalRef: commandId("sdk-rfo"),
    subject: subject("sdk.request.v1", { request: "Complete an SDK integration" }),
    mechanism: mechanisms.requestForOffers({
      capacity: 1,
      offerSchema: "sdk.offer.v1",
      offersCloseAt,
      selectionClosesAt: new Date(offersCloseAt.getTime() + 30_000),
      pricing: { mode: "required", currency: "USD", maximumAmountMinor: 50_000 },
    }),
  });
  await creator.publishMarket(created.market.id, {
    commandId: commandId("sdk-rfo-publish"), expectedVersion: created.market.version,
  });
  const firstOffer = await first.submitOffer(created.market.id, {
    commandId: commandId("sdk-rfo-offer"),
    terms: subject("sdk.offer.v1", { summary: "First private offer" }),
    amountMinor: 40_000,
  });
  const secondOffer = await second.submitOffer(created.market.id, {
    commandId: commandId("sdk-rfo-offer"),
    terms: subject("sdk.offer.v1", { summary: "Second private offer" }),
    amountMinor: 35_000,
  });
  const firstOfferID = firstOffer.offerReceipts[0].offerId;
  const secondOfferID = secondOffer.offerReceipts[0].offerId;
  const providerView = await first.getOffers(created.market.id);
  assert.deepEqual(providerView.offers.map(({ id }) => id), [firstOfferID]);
  const creatorView = await creator.getOffers(created.market.id);
  assert.equal(creatorView.offers.length, 2);

  await waitFor(async () => {
    const view = await creator.getOffers(created.market.id);
    return view.market.mechanismState.phase === "awaiting_selection" ? view : undefined;
  }, "offer close");
  const selected = await creator.selectOffers(created.market.id, {
    commandId: commandId("sdk-rfo-select"), offerIds: [secondOfferID],
  });
  assert.equal(selected.commitments[0].participantPrincipalId, second.principalId);
  const firstOutcome = await first.getMyOutcome(created.market.id);
  const secondOutcome = await second.getMyOutcome(created.market.id);
  assert.equal(firstOutcome.offers[0].state, "not_selected");
  assert.equal(secondOutcome.offers[0].state, "selected");
  assert.equal(secondOutcome.commitments[0].id, selected.commitments[0].id);
  const record = await creator.getMarketRecord(created.market.id);
  assert.equal(record.privateOffers.length, 2);
  assert.equal(record.integrity.stateReconstructed, true);
}

function subject(schema, data) {
  return { schema, data };
}

async function waitFor(probe, description) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await probe();
      if (result !== undefined) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${description}`, { cause: lastError });
}
