import type {
  LDFlag,
  LDFlagSet,
  LDRolloutVariation,
  UnleashBootstrap,
  UnleashFeature,
  UnleashVariant,
} from "./types.js";

// Both formats can express more than this converter handles: LD has
// per-user targeting rules, Unleash has gradual-rollout strategies with
// parameters. Those are rejected rather than silently flattened, since a
// silent flatten would change what the flag serves. Plain boolean flags
// and multivariate string/number flags are supported, including a
// percentage rollout across their outcomes, as long as there's no
// per-user targeting.
export class UnsupportedFlagError extends Error {}

function hasTargetingRules(flag: LDFlag): boolean {
  return (flag.targets?.length ?? 0) > 0 || (flag.rules?.length ?? 0) > 0;
}

function isBooleanPair(flag: LDFlag): boolean {
  return flag.variations.length === 2 && flag.variations[0] === true && flag.variations[1] === false;
}

// LD also allows JSON variations, but those have no fixed shape to map
// onto an Unleash payload type without guessing a schema, so only
// homogeneous string or number variation sets count as multivariate here.
function isHomogeneousMultivariate(flag: LDFlag): boolean {
  if (flag.variations.length === 0) return false;
  return flag.variations.every((v) => typeof v === "string") || flag.variations.every((v) => typeof v === "number");
}

// LD's "on" gates whether targeting runs at all; when it's off the flag
// serves offVariation regardless of fallthrough, and offVariation is
// always a fixed index (LD has no rollout on the off path).
function servedVariation(key: string, flag: LDFlag): unknown {
  if (!flag.on) return flag.variations[flag.offVariation];
  if (flag.fallthrough.variation === undefined) {
    throw new UnsupportedFlagError(`flag "${key}" has neither a fallthrough variation nor a rollout`);
  }
  return flag.variations[flag.fallthrough.variation];
}

function rolloutOutcomes(flag: LDFlag): { value: unknown; weight: number }[] | undefined {
  const variations = flag.fallthrough.rollout?.variations;
  if (!variations || variations.length === 0) return undefined;
  return variations.map((v) => ({ value: flag.variations[v.variation], weight: v.weight }));
}

// LD rollout weights are in thousandths of a percent (0-100000, so
// 100000 == 100.000%). Unleash variant weights are plain integers from 0
// to 1000 that are meant to sum to 1000 across a feature's variants.
// Scaling and flooring each weight independently would generally leave
// the total short of 1000, so the shortfall is handed out to whichever
// entries lost the most to flooring (the largest-remainder method) to
// land on an exact 1000 rather than drifting from rounding.
function ldWeightsToUnleashWeights(weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const scaled = weights.map((w) => (total === 0 ? 0 : (w / total) * 1000));
  const floors = scaled.map(Math.floor);
  const remainder = 1000 - floors.reduce((sum, w) => sum + w, 0);

  const byFractionDesc = scaled
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    floors[byFractionDesc[k % byFractionDesc.length].i]++;
  }
  return floors;
}

function unleashWeightToLdWeight(weight: number): number {
  return weight * 100;
}

function toVariant(value: unknown, weight: number): UnleashVariant {
  return {
    name: String(value),
    weight,
    weightType: "variable",
    payload: { type: typeof value === "number" ? "number" : "string", value: String(value) },
  };
}

// A gradual rollout in LD splits traffic across several fixed variations
// by weight; the Unleash analogue is a set of weighted variants under a
// strategy that's always active, rather than a strategy-level percentage
// (Unleash's flexibleRollout strategy only gates a feature on/off for a
// slice of traffic - it can't pick among more than two outcomes the way
// an LD rollout can).
function rolloutFeature(key: string, outcomes: { value: unknown; weight: number }[]): UnleashFeature {
  const weights = ldWeightsToUnleashWeights(outcomes.map((o) => o.weight));
  return {
    name: key,
    enabled: true,
    strategies: [{ name: "default", parameters: {} }],
    variants: outcomes.map((o, i) => toVariant(o.value, weights[i])),
  };
}

export function ldToUnleash(flags: LDFlagSet): UnleashBootstrap {
  const features: UnleashFeature[] = [];

  for (const [key, flag] of Object.entries(flags)) {
    if (hasTargetingRules(flag)) {
      throw new UnsupportedFlagError(`flag "${key}" has targeting rules, which this converter doesn't support yet`);
    }
    if (!isBooleanPair(flag) && !isHomogeneousMultivariate(flag)) {
      throw new UnsupportedFlagError(`flag "${key}" has variations this converter doesn't support yet`);
    }

    const outcomes = flag.on ? rolloutOutcomes(flag) : undefined;
    if (outcomes) {
      features.push(rolloutFeature(key, outcomes));
      continue;
    }

    const served = servedVariation(key, flag);
    if (isBooleanPair(flag)) {
      features.push({
        name: key,
        enabled: served === true,
        strategies: [{ name: "default", parameters: {} }],
      });
      continue;
    }

    // Carried as a single full-weight variant rather than one variant per
    // declared LD variation, since without a rollout the others can never
    // actually be reached.
    features.push({
      name: key,
      enabled: flag.on,
      strategies: [{ name: "default", parameters: {} }],
      variants: [toVariant(served, 1000)],
    });
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

    const values = feature.variants.map((v) => unleashVariantToLdValue(feature, v));

    if (feature.variants.length === 1) {
      // Unleash has no notion of an "off" value the way LD's offVariation
      // does, so the single known value is used for both fallthrough and
      // off. That's a best-effort reconstruction, not a lossless round trip.
      out[feature.name] = {
        key: feature.name,
        on: feature.enabled,
        variations: values,
        fallthrough: { variation: 0 },
        offVariation: 0,
      };
      continue;
    }

    // Several weighted variants is Unleash's way of splitting traffic,
    // which maps onto an LD rollout. LD still needs a single fixed
    // offVariation for when the flag is off, and Unleash has nothing to
    // pick that from, so the heaviest variant is used as a best guess.
    const rolloutVariations: LDRolloutVariation[] = feature.variants.map((v, i) => ({
      variation: i,
      weight: unleashWeightToLdWeight(v.weight),
    }));
    const heaviestIndex = feature.variants.reduce(
      (best, v, i) => (v.weight > feature.variants![best].weight ? i : best),
      0,
    );

    out[feature.name] = {
      key: feature.name,
      on: feature.enabled,
      variations: values,
      fallthrough: { rollout: { variations: rolloutVariations } },
      offVariation: heaviestIndex,
    };
  }

  return out;
}
