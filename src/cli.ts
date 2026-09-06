#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { ldToUnleash, unleashToLd, UnsupportedFlagError } from "./convert.js";
import type { LDFlagSet, UnleashBootstrap } from "./types.js";

function usage(): never {
  console.error("usage: flagconv --to <ld|unleash> [input.json] [output.json]");
  console.error('       "-" or a missing path means stdin (input) or stdout (output)');
  process.exit(1);
}

// Reading fd 0 directly (rather than a path like "/dev/stdin") is what
// makes this work the same on a pipe and on Windows.
function readStdin(): string {
  return readFileSync(0, "utf8");
}

function main(argv: string[]): void {
  let to: "ld" | "unleash" | undefined;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--to") {
      const value = argv[++i];
      if (value !== "ld" && value !== "unleash") usage();
      to = value;
    } else {
      positional.push(arg);
    }
  }

  const [inputPath, outputPath] = positional;
  if (!to) usage();

  const usesStdin = !inputPath || inputPath === "-";
  const usesStdout = !outputPath || outputPath === "-";
  const raw = usesStdin ? readStdin() : readFileSync(inputPath, "utf8");
  const input = JSON.parse(raw);

  try {
    const result = to === "unleash" ? ldToUnleash(input as LDFlagSet) : unleashToLd(input as UnleashBootstrap);
    const serialized = JSON.stringify(result, null, 2) + "\n";
    if (usesStdout) {
      process.stdout.write(serialized);
    } else {
      writeFileSync(outputPath, serialized);
      console.error(`wrote ${outputPath}`);
    }
  } catch (err) {
    if (err instanceof UnsupportedFlagError) {
      console.error(`conversion failed: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

main(process.argv.slice(2));
