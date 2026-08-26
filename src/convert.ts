import type { LDFlag, LDFlagSet, UnleashBootstrap, UnleashFeature, UnleashVariant } from "./types.js";

// Both formats can express more than this converter handles: LD has
// per-user targeting rules and percentage rollouts, Unleash has
// gradual-rollout strategies with parameters. Those are rejected rather
// than silently flattened, since a silent flatten would change what the
// flag serves. Plain boolean flags and multivariate string/number flags
// with a single deterministic outcome (no rules, no rollout) are
// supported.
export class UnsupportedFlagError extends Error {}

function hasTargetingRules(flag: LDFlag): boolean {
  return (flag.targets?.length ?? 0) > 0 || (flag.rules?.length ?? 0) > 0;
}

function isPlainBoolean(flag: LDFlag): boolean {
  return (
    flag.variations.length === 2 &&
    flag.variations[0] === true &&
    flag.variations[1] === false &&
    !hasTargetingRules(flag)
  );
}

// LD also allows JSON variations, but those have no fixed shape to map
// onto an Unleash payload type without guessing a schema, so only
// homogeneous string or number variation sets count as multivariate here.
function isSupportedMultivariate(flag: LDFlag): boolean {
  if (hasTargetingRules(flag) || flag.variations.length === 0) return false;
  return flag.variations.every((v) => typeof v === "string") || flag.variations.every((v) => typeof v === "number");
}

// LD's "on" gates whether targeting runs at all; when it's off the flag
// serves offVariation regardless of fallthrough.
function servedVariation(flag: LDFlag): unknown {
  return flag.on ? flag.variations[flag.fallthrough.variation] : flag.variations[flag.offVariation];
}

export function ldToUnleash(flags: LDFlagSet): UnleashBootstrap {
  const features: UnleashFeature[] = [];

  for (const [key, flag] of Object.entries(flags)) {
    if (isPlainBoolean(flag)) {
      const served = servedVariation(flag);
      features.push({
        name: key,
        enabled: served === true,
        strategies: [{ name: "default", parameters: {} }],
      });
      continue;
    }

    if (isSupportedMultivariate(flag)) {
      // There's no rollout support yet, so exactly one variation is ever
      // served. It's carried as a single full-weight variant rather than
      // one variant per declared LD variation, since the others can
      // never actually be reached.
      const served = servedVariation(flag);
      features.push({
        name: key,
        enabled: flag.on,
        strategies: [{ name: "default", parameters: {} }],
        variants: [
          {
            name: String(served),
            weight: 1000,
            weightType: "variable",
            payload: { type: typeof served === "number" ? "number" : "string", value: String(served) },
          },
        ],
      });
      continue;
    }

    throw new UnsupportedFlagError(
      `flag "${key}" has targeting rules or variations this converter doesn't support yet`,
    );
  }

  return { version: 2, features };
}

function unleashVariantToLdValue(feature: UnleashFeature, variant: UnleashVariant): string | number {
  if (!variant.payload) {
    throw new UnsupportedFlagError(
      `feature "${feature.name}" has a variant with no payload, which this converter doesn't support yet`,
    );
  }
  if (variant.payload.type === "number") return Number(variant.payload.value);
  if (variant.payload.type === "string") return variant.payload.value;
  throw new UnsupportedFlagError(
    `feature "${feature.name}" has a variant payload type "${variant.payload.type}", which this converter doesn't support yet`,
  );
}

export function unleashToLd(bootstrap: UnleashBootstrap): LDFlagSet {
  const out: LDFlagSet = {};

  for (const feature of bootstrap.features) {
    // A single default strategy with no parameters is Unleash's "on
    // for everyone" case, which maps cleanly onto LD's boolean/rollout-
    // free flags. Any other strategy (gradual rollout, user IDs, IP
    // allowlists) has no equivalent here, so it's out of scope for now.
    const hasOnlyDefaultStrategy =
      feature.strategies.length <= 1 &&
      feature.strategies.every((s) => s.name === "default" && Object.keys(s.parameters).length === 0);

    if (!hasOnlyDefaultStrategy) {
      throw new UnsupportedFlagError(
        `feature "${feature.name}" uses a non-default strategy, which this converter doesn't support yet`,
      );
    }

    if (!feature.variants || feature.variants.length === 0) {
      out[feature.name] = {
        key: feature.name,
        on: feature.enabled,
        variations: [true, false],
        fallthrough: { variation: 0 },
        offVariation: 1,
      };
      continue;
    }

    if (feature.variants.length > 1) {
      throw new UnsupportedFlagError(
        `feature "${feature.name}" has more than one variant, which this converter doesn't support yet`,
      );
    }

    const value = unleashVariantToLdValue(feature, feature.variants[0]);

    // Unleash has no notion of an "off" value the way LD's offVariation
    // does, so the single known value is used for both fallthrough and
    // off. That's a best-effort reconstruction, not a lossless round trip.
    out[feature.name] = {
      key: feature.name,
      on: feature.enabled,
      variations: [value],
      fallthrough: { variation: 0 },
      offVariation: 0,
    };
  }

  return out;
}
