// The canonical gap categories, single source of truth. `GapCategory` derives from
// this tuple so the runtime list (used to validate accepted_gaps edits), the emitted
// JSON Schema (json-schema.ts), and the type can never drift apart. Of these, only the
// three evidence-strength categories (missing / manual-only / weak) drive an
// expectation's score status; the rest are state/text-derived annotations (see
// quality-core's assessment.ts scoreStatus + classify-gaps).
//
// Lives in quality-map (the dep-light contract package) so the whole map contract —
// fields, enums, validator, and schema emitter — has one home. quality-core re-exports
// this from gap-triage/types.ts, so existing `.../gap-triage` importers are unaffected.
export const GAP_CATEGORIES = [
  "missing",
  "blocked",
  "stale",
  "deferred",
  "manual-only",
  "weak",
  "failing",
  "unavailable"
] as const;

export type GapCategory = (typeof GAP_CATEGORIES)[number];
