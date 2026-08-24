// A LaunchDarkly flag as it appears in a file-based data source (the
// format LD Relay and the offline/file datasource read). LD's real
// schema also covers prerequisites, percentage rollouts, and per-user
// targeting rules. This tool only carries what's needed to represent
// a plain on/off flag, which is what most of these fields boil down
// to in practice.
export interface LDFlag {
  key: string;
  on: boolean;
  variations: unknown[];
  fallthrough: { variation: number };
  offVariation: number;
  targets?: unknown[];
  rules?: unknown[];
}

export type LDFlagSet = Record<string, LDFlag>;

export interface UnleashStrategy {
  name: string;
  parameters: Record<string, string>;
}

export interface UnleashFeature {
  name: string;
  description?: string;
  enabled: boolean;
  strategies: UnleashStrategy[];
}

export interface UnleashBootstrap {
  version: number;
  features: UnleashFeature[];
}
