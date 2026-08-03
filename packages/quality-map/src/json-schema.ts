import {
  QUALITY_MAP_EVIDENCE_FIELDS,
  QUALITY_MAP_EVIDENCE_REQUIRED,
  QUALITY_MAP_EVIDENCE_TYPES,
  QUALITY_MAP_EXPECTATION_CATEGORIES,
  QUALITY_MAP_EXPECTATION_FIELDS,
  QUALITY_MAP_EXPECTATION_REQUIRED,
  QUALITY_MAP_POLICY_OVERRIDE_FIELDS,
  QUALITY_MAP_PRIORITIES,
  QUALITY_MAP_PROOF_GAP_FIELDS,
  QUALITY_MAP_PROOF_GAP_REQUIRED,
  QUALITY_MAP_REQUIRED_TOP_LEVEL,
  QUALITY_MAP_SOURCE_REF_FIELDS,
  QUALITY_MAP_SOURCE_TYPES,
  QUALITY_MAP_TARGET_FIELDS,
  QUALITY_MAP_TARGET_REQUIRED,
  QUALITY_MAP_TARGET_SCOPES,
  QUALITY_MAP_TASK_FIELDS,
  QUALITY_MAP_TASK_REQUIRED,
  QUALITY_MAP_TASK_STATUSES,
  QUALITY_MAP_TOP_LEVEL_FIELDS,
  STRUCTURE_PROVENANCE_VALUES,
} from "./schema";
import { GAP_CATEGORIES } from "./gap-categories";

// Single source of truth for the quality-map JSON Schema the `quality` skill/CLI consume.
// The schema is BUILT from the same field-list + vocabulary constants the validator uses
// (./schema) plus the canonical gap categories (./gap-categories), so the authoring contract
// can no longer drift from validate/normalize — the recurring bug this replaces (e.g.
// `accepted_gaps` added to the validator but not the skill schema; `require_multi_layer`
// retired from the skill but left in the field list).
//
// Field-name parity is *guaranteed*: each object's `properties` keys are produced by iterating
// the field-list constant, and `objectSchema` throws if a listed field has no schema mapping —
// so adding a field to a `*_FIELDS` constant without teaching the emitter fails the build (and
// the drift-guard test) instead of silently shipping a schema that omits it.

export type JsonSchema = Record<string, unknown>;

const SCHEMA_ID = "https://shiplight.dev/schemas/quality-evidence/quality-map.schema.json";

function ref(name: string): JsonSchema {
  return { $ref: `#/$defs/${name}` };
}

function enumOf(values: readonly string[]): JsonSchema {
  return { enum: [...values] };
}

function arrayOf(items: JsonSchema): JsonSchema {
  return { type: "array", items };
}

const nonEmptyString: JsonSchema = { type: "string", minLength: 1 };

/**
 * Build an object subschema whose `properties` keys are exactly `fields` (in order),
 * looking each up in `propertyMap`. Throws on a field with no mapping so the emitter
 * can never fall behind a `*_FIELDS` constant.
 */
function objectSchema(
  fields: readonly string[],
  required: readonly string[],
  propertyMap: Record<string, JsonSchema>,
  extra: JsonSchema = {},
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const field of fields) {
    const schema = propertyMap[field];
    if (schema === undefined) {
      throw new Error(`quality-map JSON Schema: no mapping for field '${field}' (add it to the emitter)`);
    }
    properties[field] = schema;
  }
  return {
    type: "object",
    additionalProperties: false,
    ...(required.length > 0 ? { required: [...required] } : {}),
    properties,
    ...extra,
  };
}

/** The quality-map JSON Schema (draft 2020-12), assembled from the contract constants. */
export function buildQualityMapJsonSchema(): JsonSchema {
  const sourceRef = objectSchema(
    QUALITY_MAP_SOURCE_REF_FIELDS,
    [],
    {
      path: nonEmptyString,
      url: nonEmptyString,
      label: { type: "string" },
      anchor: { type: "string" },
    },
    // The validator accepts a source ref with a path OR a url (validate.ts).
    { anyOf: [{ required: ["path"] }, { required: ["url"] }] },
  );

  const task = objectSchema(QUALITY_MAP_TASK_FIELDS, QUALITY_MAP_TASK_REQUIRED, {
    id: nonEmptyString,
    path: nonEmptyString,
    status: enumOf(QUALITY_MAP_TASK_STATUSES),
    title: { type: "string" },
  });

  const policyOverride = objectSchema(QUALITY_MAP_POLICY_OVERRIDE_FIELDS, [], {
    preferred_modalities: arrayOf(ref("evidenceType")),
    discouraged_modalities: arrayOf(ref("evidenceType")),
    required_modalities: arrayOf(ref("evidenceType")),
    required_contexts: arrayOf(nonEmptyString),
    require_gate: { type: "boolean" },
    notes: { type: "string" },
  });

  const proofGap = objectSchema(QUALITY_MAP_PROOF_GAP_FIELDS, QUALITY_MAP_PROOF_GAP_REQUIRED, {
    summary: nonEmptyString,
    next_step: { type: ["string", "null"] },
  });

  const evidence = objectSchema(QUALITY_MAP_EVIDENCE_FIELDS, QUALITY_MAP_EVIDENCE_REQUIRED, {
    id: nonEmptyString,
    type: ref("evidenceType"),
    path: { type: "string" },
    url: { type: "string" },
    command: { type: "string" },
    contexts: arrayOf(nonEmptyString),
    notes: { type: "string" },
    test_case: { type: "string" },
  });

  const expectation = objectSchema(QUALITY_MAP_EXPECTATION_FIELDS, QUALITY_MAP_EXPECTATION_REQUIRED, {
    id: nonEmptyString,
    title: nonEmptyString,
    description: { type: "string" },
    source_type: enumOf(QUALITY_MAP_SOURCE_TYPES),
    structure_provenance: ref("structureProvenance"),
    source_refs: arrayOf(ref("sourceRef")),
    category: enumOf(QUALITY_MAP_EXPECTATION_CATEGORIES),
    priority: enumOf(QUALITY_MAP_PRIORITIES),
    tasks: arrayOf(ref("task")),
    policy_override: ref("policyOverride"),
    evidence: arrayOf(ref("evidence")),
    proof_gap: ref("proofGap"),
    accepted_gaps: arrayOf(ref("gapCategory")),
  });

  const target = objectSchema(QUALITY_MAP_TARGET_FIELDS, QUALITY_MAP_TARGET_REQUIRED, {
    id: nonEmptyString,
    name: nonEmptyString,
    scope: enumOf(QUALITY_MAP_TARGET_SCOPES),
    aliases: arrayOf(nonEmptyString),
    source_refs: arrayOf(ref("sourceRef")),
  });

  const topLevel = objectSchema(QUALITY_MAP_TOP_LEVEL_FIELDS, QUALITY_MAP_REQUIRED_TOP_LEVEL, {
    target,
    expectations: arrayOf(ref("expectation")),
    structure_provenance: ref("structureProvenance"),
    checks_reviewed: { type: "boolean" },
  });

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: SCHEMA_ID,
    $comment:
      "GENERATED from @shiplightai/quality-map buildQualityMapJsonSchema(). " +
      "Do not edit by hand — run `pnpm generate:qc-schema` to regenerate.",
    title: "Quality Evidence Map",
    ...topLevel,
    $defs: {
      structureProvenance: enumOf(STRUCTURE_PROVENANCE_VALUES),
      gapCategory: enumOf(GAP_CATEGORIES),
      evidenceType: enumOf(QUALITY_MAP_EVIDENCE_TYPES),
      sourceRef,
      task,
      policyOverride,
      proofGap,
      evidence,
      expectation,
    },
  };
}

/** Canonical serialized form written to the checked-in artifact + the skill asset. */
export function serializeQualityMapJsonSchema(): string {
  return `${JSON.stringify(buildQualityMapJsonSchema(), null, 2)}\n`;
}
