import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const platformNeutralModules = [
  "client.ts",
  "errors.ts",
  "ids.ts",
  "index.ts",
  "mechanisms.ts",
  "transport.ts",
];

test("the main SDK entry has no Node-only module imports", async () => {
  for (const module of platformNeutralModules) {
    const source = await readFile(new URL(`../src/${module}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()["']node:/, module);
  }
});
