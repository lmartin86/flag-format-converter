import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ldToUnleash, unleashToLd } from "../src/convert.js";
import type { LDFlagSet, UnleashBootstrap } from "../src/types.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;
}

test("boolean flags: ld -> unleash", () => {
  const ld = fixture<LDFlagSet>("ld-boolean.json");
  const unleash = fixture<UnleashBootstrap>("unleash-boolean.json");
  assert.deepEqual(ldToUnleash(ld), unleash);
});

test("boolean flags: unleash -> ld", () => {
  const ld = fixture<LDFlagSet>("ld-boolean.json");
  const unleash = fixture<UnleashBootstrap>("unleash-boolean.json");
  assert.deepEqual(unleashToLd(unleash), ld);
});

test("boolean flags round-trip losslessly through both directions", () => {
  const ld = fixture<LDFlagSet>("ld-boolean.json");
  assert.deepEqual(unleashToLd(ldToUnleash(ld)), ld);
});

test("single-variant multivariate flag: ld -> unleash", () => {
  const ld = fixture<LDFlagSet>("ld-multivariate.json");
  const unleash = fixture<UnleashBootstrap>("unleash-multivariate.json");
  assert.deepEqual(ldToUnleash(ld), unleash);
});

// A multivariate flag with no rollout only ever serves one of its
// declared variations, so converting to Unleash and back can't recover
// the ones that were dropped. This pins down that known lossy shape
// (see README) instead of just asserting the forward direction.
test("single-variant multivariate flag does not round-trip losslessly", () => {
  const unleash = fixture<UnleashBootstrap>("unleash-multivariate.json");
  const roundTripped = fixture<LDFlagSet>("ld-multivariate-roundtrip.json");
  assert.deepEqual(unleashToLd(unleash), roundTripped);
});

test("percentage rollout: ld -> unleash", () => {
  const ld = fixture<LDFlagSet>("ld-rollout.json");
  const unleash = fixture<UnleashBootstrap>("unleash-rollout.json");
  assert.deepEqual(ldToUnleash(ld), unleash);
});

test("percentage rollout: unleash -> ld", () => {
  const ld = fixture<LDFlagSet>("ld-rollout.json");
  const unleash = fixture<UnleashBootstrap>("unleash-rollout.json");
  assert.deepEqual(unleashToLd(unleash), ld);
});

test("percentage rollout round-trips losslessly when the off variation matches the heaviest one", () => {
  const ld = fixture<LDFlagSet>("ld-rollout.json");
  assert.deepEqual(unleashToLd(ldToUnleash(ld)), ld);
});
