# flag-format-converter

Converts feature flag definitions between two JSON formats:

- LaunchDarkly's file-source format (what LD Relay and the offline/file
  datasource read)
- Unleash's bootstrap format (what the Unleash proxy hands to clients on
  startup)

The use case is switching flag providers, or running one provider as a
mirror of the other during a migration, without hand-editing every flag
definition.

## Scope

This handles boolean flags (on for everyone, off for everyone) and
multivariate flags with string or number variations, as long as there's
no per-user targeting. LaunchDarkly's per-user targeting rules, JSON
variations, and Unleash's non-default strategies (user ID lists, IP
allowlists) have no equivalent on the other side, so the converter
refuses to guess and exits with an error instead of silently dropping
targeting logic.

A percentage rollout — LD's fallthrough splitting traffic across several
variations by weight — is supported. It maps onto Unleash as a set of
weighted variants under the always-active "default" strategy, since
Unleash's own gradual-rollout strategy only gates a feature on or off
for a slice of traffic and can't pick among more than that. Weights are
rescaled between LD's 0-100000 (thousandths of a percent) and Unleash's
0-1000 range, using the largest-remainder method so the converted
weights still sum to the right total instead of drifting from rounding.

A multivariate LD flag with no rollout becomes an Unleash feature with a
single full-weight variant carrying the served value as its payload; the
other declared-but-unreachable LD variations are dropped, since they can
never actually be served. Converting back, a single-variant feature's
payload is used for both the fallthrough and off variation — Unleash has
no equivalent of LD's separate off-value, so this direction isn't a
lossless round trip for multivariate flags the way the boolean case is.
A multi-variant feature becomes an LD rollout the same way, with the
heaviest variant reused as the off-value guess.

## Usage

```
node --experimental-strip-types src/cli.ts --to unleash flags-ld.json flags-unleash.json
node --experimental-strip-types src/cli.ts --to ld flags-unleash.json flags-ld.json
```

(Or compile first with `tsc` and run the output in `dist/`. Any TypeScript
toolchain works; this repo doesn't pin one.)

Either path can be omitted or given as `-` to use stdin/stdout instead,
so the tool can sit in a pipeline:

```
curl https://example/flags.json | node --experimental-strip-types src/cli.ts --to unleash > flags-unleash.json
```

### LaunchDarkly input

```json
{
  "new-checkout-flow": {
    "key": "new-checkout-flow",
    "on": true,
    "variations": [true, false],
    "fallthrough": { "variation": 0 },
    "offVariation": 1
  }
}
```

### Unleash output

```json
{
  "version": 2,
  "features": [
    {
      "name": "new-checkout-flow",
      "enabled": true,
      "strategies": [{ "name": "default", "parameters": {} }]
    }
  ]
}
```

Converting back from Unleash to LaunchDarkly produces the same shape as
the first example, minus any fields (name, description) that don't exist
in the LD schema.

## Layout

- `src/types.ts` — the subset of each format this tool understands
- `src/convert.ts` — the two conversion functions
- `src/cli.ts` — file-in, file-out command line wrapper
- `test/` — fixture-based conversion tests, run with `npm test` (uses
  Node's built-in test runner, no extra tooling)

No third-party dependencies. Standard library only.
