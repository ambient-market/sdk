import assert from "node:assert/strict";
import { test } from "node:test";
import { AmbientClient, mechanisms } from "../dist/index.js";

const close = "2026-10-02T20:00:00Z";
test("lottery builders distinguish immediate awards from creator review", () => {
  assert.deepEqual(mechanisms.lottery({ capacity: 2, entryClosesAt: close }), {
    presetId: "lottery.v1",
    config: { capacity: 2, entryClosesAt: "2026-10-02T20:00:00.000Z", confirmation: "none" },
  });
  assert.deepEqual(mechanisms.lottery({
    capacity: 1, entryClosesAt: new Date(close), confirmation: "creator",
    confirmationWindowSeconds: 600, resolutionDeadline: "2026-10-03T20:00:00Z",
    eligibilityTerms: "  Reply before close  ",
  }).config, {
    capacity: 1, entryClosesAt: "2026-10-02T20:00:00.000Z", confirmation: "creator",
    confirmationWindowSeconds: 600, resolutionDeadline: "2026-10-03T20:00:00.000Z",
    eligibilityTerms: "Reply before close",
  });
});

test("lottery builders reject malformed rules without inventing a local draw", () => {
  const valid = { capacity: 1, entryClosesAt: close };
  for (const extra of [
    { capacity: 0 }, { capacity: 1.5 }, { capacity: 2 ** 32 },
    { entryClosesAt: "invalid" }, { confirmation: "participant" },
    { confirmationWindowSeconds: 0 }, { resolutionDeadline: close },
    { confirmation: "creator" },
    { confirmation: "creator", confirmationWindowSeconds: 600, resolutionDeadline: close },
    { confirmation: "creator", confirmationWindowSeconds: 2 ** 32, resolutionDeadline: "2026-10-03T00:00:00Z" },
    { eligibilityTerms: "🙂".repeat(2049) },
  ]) assert.throws(() => mechanisms.lottery({ ...valid, ...extra }), TypeError);
  assert.throws(() => mechanisms.lottery(), TypeError);
  assert.equal(mechanisms.drawLottery, undefined);
});

test("lottery methods bind authority, encode IDs, forward reason and preserve scoped receipts", async () => {
  const calls = [];
  const entry = { id: "entry", state: "active", evidenceUrl: "https://x.com/a/status/1", submittedAt: close, updatedAt: close };
  const ambient = new AmbientClient({ baseURL: "https://ambient.test", fetch: async (url, init) => {
    calls.push({ path: new URL(url).pathname + new URL(url).search, method: init.method, body: init.body && JSON.parse(init.body), headers: init.headers });
    const body = String(url).includes("my-outcome") ? { lotteryEntries: [entry], commitments: [] }
      : String(url).includes("lottery-review") ? { candidates: [{ entry, commitment: { id: "award" } }] }
      : { market: { version: 2 }, events: [], commitments: [] };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }});
  const principal = ambient.withToken("token").forPrincipal("principal", "grant");
  const input = { commandId: "enter", evidenceUrl: entry.evidenceUrl, principalId: "spoof", authorityRef: "spoof" };
  await principal.enterLottery("market/1", input);
  await principal.withdrawLotteryEntry("market/1", { commandId: "withdraw", entryId: "entry" });
  const outcome = await principal.getMyOutcome("market/1");
  const review = await principal.getLotteryReview("market/1");
  await principal.declineCommitment("award/1", { commandId: "decline", reason: "Does not meet the published terms" });
  assert.deepEqual(outcome.lotteryEntries, [entry]);
  assert.deepEqual(review.candidates[0].entry, entry);
  assert.deepEqual(calls.map(c => [c.method, c.path]), [
    ["POST", "/v1/markets/market%2F1/lottery-entries"],
    ["POST", "/v1/markets/market%2F1/lottery-withdrawals"],
    ["GET", "/v1/markets/market%2F1/my-outcome?principalId=principal&authorityRef=grant"],
    ["GET", "/v1/markets/market%2F1/lottery-review?principalId=principal&authorityRef=grant"],
    ["POST", "/v1/commitments/award%2F1/decline"],
  ]);
  for (const c of calls) assert.equal(c.headers.Authorization, "Bearer token");
  for (const c of calls.filter(c => c.method === "POST")) {
    assert.equal(c.body.principalId, "principal");
    assert.equal(c.body.authorityRef, "grant");
  }
  assert.equal(calls[0].body.evidenceUrl, entry.evidenceUrl);
  assert.equal(calls[1].body.entryId, "entry");
  assert.equal(calls[4].body.reason, "Does not meet the published terms");
  assert.equal(input.principalId, "spoof"); // caller input is not mutated
});
