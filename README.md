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
no per-user targeting and no percentage rollout — in other words, flags
that always serve the same one variation to everyone. LaunchDarkly's
per-user targeting rules and percentage rollouts, JSON variations, and
Unleash's non-default strategies (gradual rollout, user ID lists, IP
allowlists) have no equivalent on the other side, so the converter
refuses to guess and exits with an error instead of silently dropping
targeting logic.

A multivariate LD flag becomes an Unleash feature with a single
full-weight variant carrying the served value as its payload; the other
declared-but-unreachable LD variations are dropped, since without
rollout support they can never actually be served. Converting back,
that one variant's payload is used for both the fallthrough and off
variation — Unleash has no equivalent of LD's separate off-value, so
this direction isn't a lossless round trip for multivariate flags the
way the boolean case is.

## Usage

```
node --experimental-strip-types src/cli.ts --to unleash flags-ld.json flags-unleash.json
node --experimental-strip-types src/cli.ts --to ld flags-unleash.json flags-ld.json
```

(Or compile first with `tsc` and run the output in `dist/`. Any TypeScript
toolchain works; this repo doesn't pin one.)

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

No third-party dependencies. Standard library only.
