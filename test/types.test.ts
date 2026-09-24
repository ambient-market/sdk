import {
  AmbientAPIError,
  AmbientClient,
  commandId,
  mechanisms,
  isVersionConflict,
  type Delegation,
  type MarketResult,
} from "@ambient-market/sdk";
import { NodeAgentKey } from "@ambient-market/sdk/node";

const ambient = new AmbientClient({ baseURL: "https://ambient.example" });
const key = NodeAgentKey.generate();
const savedKey: string = key.exportPKCS8();
const restoredKey = NodeAgentKey.fromPKCS8(savedKey);

async function lifecycle() {
  const session = await ambient.registerAndAuthenticateAgent(restoredKey);
  const creator = session.principal();
  const created: MarketResult = await creator.createMarket({
    commandId: commandId("create"),
    subject: { schema: "example.request.v1", data: { title: "Typed request" } },
    mechanism: mechanisms.directClaim({ capacity: 1 }),
  });
  await creator.publishMarket(created.market.id, {
    commandId: commandId("publish"),
    expectedVersion: created.market.version,
  });
  await creator.getMarketRecord(created.market.id);
  const delegation: Delegation = await session.issueDelegation({
    commandId: commandId("delegate"),
    delegationId: commandId("delegation"),
    delegateActorId: "sub-agent",
    scopes: ["market:create"],
  });
  void delegation;
}

const delegated = ambient.withToken("token", { actorId: "agent" })
  .forPrincipal("person", "delegation");
void delegated.submitOffer("market", {
  commandId: commandId("offer"),
  terms: { schema: "example.offer.v1", data: { summary: "Typed offer" } },
  amountMinor: 12_500,
});

const auction = mechanisms.sealedAuction({
  currency: "USD",
  closesAt: new Date(),
  holdDurationSeconds: 300,
});
auction.presetId satisfies "sealed-forward-auction.v1";

const error: AmbientAPIError = new AmbientAPIError("conflict", {
  status: 409, code: "conflict",
});
void error;
void isVersionConflict(error);
void lifecycle;
