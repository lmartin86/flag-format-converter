import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findUnsupportedLdFlags, findUnsupportedUnleashFeatures, ldToUnleash, unleashToLd } from "../src/convert.js";
import type { LDFlag, LDFlagSet, UnleashBootstrap, UnleashFeature } from "../src/types.js";

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

test("findUnsupportedLdFlags reports every offending flag without throwing", () => {
  const good: LDFlag = {
    key: "good-flag",
    on: true,
    variations: [true, false],
    fallthrough: { variation: 0 },
    offVariation: 1,
  };
  const targeted: LDFlag = {
    key: "targeted-flag",
    on: true,
    variations: [true, false],
    fallthrough: { variation: 0 },
    offVariation: 1,
    targets: [{ variation: 0, values: ["user-1"] }],
  };
  const jsonVariations: LDFlag = {
    key: "json-flag",
    on: true,
    variations: [{ nested: true }, { nested: false }],
    fallthrough: { variation: 0 },
    offVariation: 1,
  };

  const unsupported = findUnsupportedLdFlags({ "good-flag": good, "targeted-flag": targeted, "json-flag": jsonVariations });

  assert.deepEqual(
    unsupported.map((u) => u.key),
    ["targeted-flag", "json-flag"],
  );
  assert.match(unsupported[0].reason, /targeting rules/);
  assert.match(unsupported[1].reason, /variations this converter doesn't support/);
});

test("findUnsupportedUnleashFeatures reports every offending feature without throwing", () => {
  const good: UnleashFeature = { name: "good-feature", enabled: true, strategies: [{ name: "default", parameters: {} }] };
  const gradual: UnleashFeature = {
    name: "gradual-feature",
    enabled: true,
    strategies: [{ name: "flexibleRollout", parameters: { rollout: "50" } }],
  };

  const unsupported = findUnsupportedUnleashFeatures({ version: 2, features: [good, gradual] });

  assert.deepEqual(
    unsupported.map((u) => u.key),
    ["gradual-feature"],
  );
  assert.match(unsupported[0].reason, /non-default strategy/);
});
