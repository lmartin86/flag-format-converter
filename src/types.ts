// One weighted outcome in a percentage rollout: `variation` indexes into
// the flag's `variations` array, `weight` is in thousandths of a percent
// (0-100000, so 100000 == 100.000%) and the weights across a rollout are
// expected to sum to 100000.
export interface LDRolloutVariation {
  variation: number;
  weight: number;
}

export interface LDRollout {
  variations: LDRolloutVariation[];
}

// LD's fallthrough carries either a fixed variation index or a rollout,
// never both, mirroring how the real schema distinguishes the two.
export interface LDFallthrough {
  variation?: number;
  rollout?: LDRollout;
}

// A LaunchDarkly flag as it appears in a file-based data source (the
// format LD Relay and the offline/file datasource read). LD's real
// schema also covers prerequisites and per-user targeting rules. This
// tool only carries what's needed to represent a plain on/off flag or
// one with a percentage rollout, which is what most of these fields
// boil down to in practice.
export interface LDFlag {
  key: string;
  on: boolean;
  variations: unknown[];
  fallthrough: LDFallthrough;
  offVariation: number;
  targets?: unknown[];
  rules?: unknown[];
}

export type LDFlagSet = Record<string, LDFlag>;

export interface UnleashStrategy {
  name: string;
  parameters: Record<string, string>;
}

// The payload carries a multivariate flag's served value. Unleash also
// supports a "json" and "csv" payload type; those have no LD variation
// type to land on, so the converter doesn't produce or accept them.
export interface UnleashVariantPayload {
  type: string;
  value: string;
}

export interface UnleashVariant {
  name: string;
  weight: number;
  weightType?: string;
  payload?: UnleashVariantPayload;
}

export interface UnleashFeature {
  name: string;
  description?: string;
  enabled: boolean;
  strategies: UnleashStrategy[];
  variants?: UnleashVariant[];
}

export interface UnleashBootstrap {
  version: number;
  features: UnleashFeature[];
}
