#!/usr/bin/env tsx
/* eslint-disable no-console -- CLI generator: progress output to stdout is intended. */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeQualityMapJsonSchema } from "./json-schema";

// Regenerates the checked-in canonical quality-map JSON Schema from the engine constants (the
// single source of truth).
//
//   pnpm generate:quality-map-schema
//
// The canonical artifact is drift-guarded in CI (quality-map-schema.test.ts asserts it equals the
// emitter output) and shipped as a resolvable asset by quality-tools (dist/quality-map.schema.json,
// via tsup). The `quality` skill no longer keeps its own copy — it sources the contract from the
// installed quality-tools (`quality-tools schema` / `validate`). Lives inside the quality package so
// importing the engine is allowed by the QC import boundary (a build script under scripts/ is not).

// dir = packages/quality-map/src → up 3 = repo root.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const CANONICAL = join(repoRoot, "packages/quality-map/src/quality-map.schema.json");

async function main(): Promise<void> {
  await writeFile(CANONICAL, serializeQualityMapJsonSchema());
  console.log(`wrote ${CANONICAL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
