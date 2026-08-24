import type { LDFlag, LDFlagSet, UnleashBootstrap, UnleashFeature } from "./types.js";

// Both formats can express more than a plain boolean flag: LD has
// multivariate flags with N variations and per-user rules, Unleash has
// gradual-rollout strategies with parameters. This converter only
// handles the boolean case, which covers most flags most teams manage
// day to day. Anything richer is rejected rather than silently
// flattened, since a silent flatten would change what the flag serves.
export class UnsupportedFlagError extends Error {}

function isPlainBoolean(flag: LDFlag): boolean {
  return (
    flag.variations.length === 2 &&
    flag.variations[0] === true &&
    flag.variations[1] === false &&
    (!flag.targets || flag.targets.length === 0) &&
    (!flag.rules || flag.rules.length === 0)
  );
}

export function ldToUnleash(flags: LDFlagSet): UnleashBootstrap {
  const features: UnleashFeature[] = [];

  for (const [key, flag] of Object.entries(flags)) {
    if (!isPlainBoolean(flag)) {
      throw new UnsupportedFlagError(
        `flag "${key}" has targeting rules or non-boolean variations, which this converter doesn't support yet`,
      );
    }

    // LD's "on" gates whether targeting runs at all; when it's off the
    // flag serves offVariation regardless of fallthrough. For a plain
    // boolean flag with no rules, whatever gets served is exactly what
    // "enabled" means in Unleash.
    const served = flag.on ? flag.variations[flag.fallthrough.variation] : flag.variations[flag.offVariation];

    features.push({
      name: key,
      enabled: served === true,
      strategies: [{ name: "default", parameters: {} }],
    });
  }

  return { version: 2, features };
}

export function unleashToLd(bootstrap: UnleashBootstrap): LDFlagSet {
  const out: LDFlagSet = {};

  for (const feature of bootstrap.features) {
    // A single default strategy with no parameters is Unleash's "on
    // for everyone" case, which maps cleanly onto a boolean LD flag.
    // Any other strategy (gradual rollout, user IDs, IP allowlists)
    // has no boolean equivalent, so it's out of scope for now.
    const hasOnlyDefaultStrategy =
      feature.strategies.length <= 1 &&
      feature.strategies.every((s) => s.name === "default" && Object.keys(s.parameters).length === 0);

    if (!hasOnlyDefaultStrategy) {
      throw new UnsupportedFlagError(
        `feature "${feature.name}" uses a non-default strategy, which this converter doesn't support yet`,
      );
    }

    out[feature.name] = {
      key: feature.name,
      on: feature.enabled,
      variations: [true, false],
      fallthrough: { variation: 0 },
      offVariation: 1,
    };
  }

  return out;
}
