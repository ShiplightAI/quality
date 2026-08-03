export const QUALITY_MAP_TOP_LEVEL_FIELDS = [
  "target",
  "expectations",
  "structure_provenance",
  // Human attestation (gate 4): set true when a person reviews and approves the
  // check list. Orthogonal to structure_provenance (the check's origin, which is
  // never overwritten): a check stays "inferred_brownfield" yet counts as
  // reviewed once a human signs off on the set.
  "checks_reviewed"
] as const;

// Declares how the map's structure (its set of expectations) was produced, so
// structure confidence can be reported separately from evidence confidence.
// "unspecified" is the default for maps that omit the field; it scores 0 and is
// counted in the structure-confidence denominator (the human anchor — unattested
// structure earns no trust until its provenance is declared).
export const STRUCTURE_PROVENANCE_VALUES = [
  "spec",
  "user_authored",
  "agent_generated",
  "inferred_brownfield",
  "unspecified"
] as const;

export type StructureProvenance = (typeof STRUCTURE_PROVENANCE_VALUES)[number];

export type StructureProvenanceClassification =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" }
  | { readonly kind: "valid"; readonly value: StructureProvenance };

// Distinguishes three cases the resolver and validator must treat differently:
// absent (null/empty -> inherit the map default), invalid (declared but
// out-of-vocabulary -> force "unspecified" and warn), and valid.
export function classifyStructureProvenance(value: unknown): StructureProvenanceClassification {
  if (typeof value !== "string") {
    return { kind: "absent" };
  }
  const text = value.trim().toLowerCase();
  if (text.length === 0) {
    return { kind: "absent" };
  }
  const match = STRUCTURE_PROVENANCE_VALUES.find((candidate) => candidate === text);
  return match === undefined ? { kind: "invalid" } : { kind: "valid", value: match };
}

export const QUALITY_MAP_TARGET_FIELDS = [
  "id",
  "name",
  "scope",
  "aliases",
  "source_refs"
] as const;

export const QUALITY_MAP_SOURCE_REF_FIELDS = ["path", "url", "label", "anchor"] as const;

export const QUALITY_MAP_EXPECTATION_FIELDS = [
  "id",
  "title",
  "description",
  "source_type",
  "structure_provenance",
  "source_refs",
  "category",
  "priority",
  "tasks",
  "policy_override",
  "evidence",
  "proof_gap",
  "accepted_gaps"
] as const;

export const QUALITY_MAP_TASK_FIELDS = ["id", "path", "status", "title"] as const;

export const QUALITY_MAP_POLICY_OVERRIDE_FIELDS = [
  "preferred_modalities",
  "discouraged_modalities",
  "required_modalities",
  "required_contexts",
  // `require_multi_layer` was retired (proof strength is not a raw modality count);
  // it is no longer a recognized field, so a map that still sets it now warns as unknown.
  "require_gate",
  "notes"
] as const;

export const QUALITY_MAP_PROOF_GAP_FIELDS = [
  "summary",
  "next_step"
] as const;

export const QUALITY_MAP_EVIDENCE_FIELDS = [
  "id",
  "type",
  "path",
  "url",
  "command",
  "contexts",
  "notes",
  // Optional case-pin joining this evidence to a specific observed test case
  // (normalize.ts reads it into the graph; see observations/resolve.ts).
  "test_case"
] as const;

// ---------------------------------------------------------------------------
// Authoring vocabulary — the enum value sets the map may use. These are the
// single source of truth for the emitted JSON Schema the `quality` skill
// consumes (see ./json-schema.ts). The validator accepts any string for these
// fields today; the schema is the authoring contract, so agents write from
// this vocabulary.
// ---------------------------------------------------------------------------

export const QUALITY_MAP_TARGET_SCOPES = ["feature", "module", "pr", "ticket"] as const;

export const QUALITY_MAP_SOURCE_TYPES = ["SOURCE", "IMPLEMENTATION", "INFERRED"] as const;

export const QUALITY_MAP_EXPECTATION_CATEGORIES = [
  "billing",
  "auth",
  "security",
  "data",
  "ui",
  "api",
  "ops",
  "performance",
  "privacy",
  "compliance",
  "other"
] as const;

export const QUALITY_MAP_PRIORITIES = ["P0", "P1", "P2", "P3", "UNKNOWN"] as const;

export const QUALITY_MAP_TASK_STATUSES = [
  "planned",
  "in_progress",
  "done",
  "deferred",
  "blocked",
  "unknown"
] as const;

export const QUALITY_MAP_EVIDENCE_TYPES = [
  "unit",
  "contract",
  "integration",
  "e2e",
  "agent",
  "manual",
  "telemetry",
  "static",
  "smoke",
  "script",
  "other"
] as const;

// ---------------------------------------------------------------------------
// Required-field sets — mirror the validator's error diagnostics (validate.ts):
// the fields whose absence yields an ERROR (not a warning). The emitted schema's
// `required` derives from these, so the schema can't demand a field the engine
// treats as optional, nor omit one the engine errors on.
// ---------------------------------------------------------------------------

export const QUALITY_MAP_REQUIRED_TOP_LEVEL = ["target", "expectations"] as const;
export const QUALITY_MAP_TARGET_REQUIRED = ["id", "name", "scope"] as const;
export const QUALITY_MAP_EXPECTATION_REQUIRED = ["id", "title", "source_type", "category", "priority"] as const;
export const QUALITY_MAP_EVIDENCE_REQUIRED = ["id", "type"] as const;
export const QUALITY_MAP_TASK_REQUIRED = ["id"] as const;
export const QUALITY_MAP_PROOF_GAP_REQUIRED = ["summary"] as const;
