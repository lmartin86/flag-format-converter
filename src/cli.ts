#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { ldToUnleash, unleashToLd, UnsupportedFlagError } from "./convert.js";
import type { LDFlagSet, UnleashBootstrap } from "./types.js";

function usage(): never {
  console.error("usage: flagconv --to <ld|unleash> <input.json> <output.json>");
  process.exit(1);
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
  if (!to || !inputPath || !outputPath) usage();

  const input = JSON.parse(readFileSync(inputPath, "utf8"));

  try {
    const result = to === "unleash" ? ldToUnleash(input as LDFlagSet) : unleashToLd(input as UnleashBootstrap);
    writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
    console.error(`wrote ${outputPath}`);
  } catch (err) {
    if (err instanceof UnsupportedFlagError) {
      console.error(`conversion failed: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

main(process.argv.slice(2));
