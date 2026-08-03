import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GAP_CATEGORIES } from "./gap-categories";
import { buildQualityMapJsonSchema, serializeQualityMapJsonSchema } from "./json-schema";
import {
  QUALITY_MAP_EVIDENCE_FIELDS,
  QUALITY_MAP_EXPECTATION_FIELDS,
  QUALITY_MAP_POLICY_OVERRIDE_FIELDS,
  QUALITY_MAP_PROOF_GAP_FIELDS,
  QUALITY_MAP_SOURCE_REF_FIELDS,
  QUALITY_MAP_TARGET_FIELDS,
  QUALITY_MAP_TASK_FIELDS,
  QUALITY_MAP_TOP_LEVEL_FIELDS,
} from "./schema";

const canonicalPath = join(dirname(fileURLToPath(import.meta.url)), "quality-map.schema.json");
const canonicalText = readFileSync(canonicalPath, "utf8");

 
function props(schema: any): string[] {
  return Object.keys(schema.properties ?? {});
}

describe("quality-map JSON Schema (single source)", () => {
  it("the checked-in artifact is exactly what the emitter produces (regenerate with pnpm generate:qc-schema)", () => {
    // Byte-for-byte, so both formatting and content drift are caught in CI.
    expect(canonicalText).toBe(serializeQualityMapJsonSchema());
  });

  // Property-name parity with the validator's field-list constants is the whole point:
  // the schema can never allow a field the validator rejects, nor omit one it accepts.
  it.each([
    ["$", (s: Record<string, unknown>) => s, QUALITY_MAP_TOP_LEVEL_FIELDS],
    ["target", (s: Record<string, unknown>) => (s.properties as Record<string, unknown>).target, QUALITY_MAP_TARGET_FIELDS],
    ["$defs.sourceRef", (s: any) => s.$defs.sourceRef, QUALITY_MAP_SOURCE_REF_FIELDS],
    ["$defs.task", (s: any) => s.$defs.task, QUALITY_MAP_TASK_FIELDS],
    ["$defs.policyOverride", (s: any) => s.$defs.policyOverride, QUALITY_MAP_POLICY_OVERRIDE_FIELDS],
    ["$defs.proofGap", (s: any) => s.$defs.proofGap, QUALITY_MAP_PROOF_GAP_FIELDS],
    ["$defs.evidence", (s: any) => s.$defs.evidence, QUALITY_MAP_EVIDENCE_FIELDS],
    ["$defs.expectation", (s: any) => s.$defs.expectation, QUALITY_MAP_EXPECTATION_FIELDS],
     
  ])("%s properties equal the engine field list and disallow extras", (_name, pick, fields) => {
    const schema = buildQualityMapJsonSchema();
     
    const node = pick(schema as any);
    expect(props(node)).toEqual([...fields]);
    expect(node.additionalProperties).toBe(false);
  });

  it("sources gap categories from the engine's canonical GAP_CATEGORIES", () => {
    const schema = buildQualityMapJsonSchema() as { $defs: { gapCategory: { enum: string[] } } };
    expect(schema.$defs.gapCategory.enum).toEqual([...GAP_CATEGORIES]);
  });

  it("reflects the retired require_multi_layer and the live test_case fields", () => {
    const schema = buildQualityMapJsonSchema() as {
      $defs: { policyOverride: { properties: Record<string, unknown> }; evidence: { properties: Record<string, unknown> } };
    };
    expect(schema.$defs.policyOverride.properties).not.toHaveProperty("require_multi_layer");
    expect(schema.$defs.evidence.properties).toHaveProperty("test_case");
  });
});
