import type { GapRecord } from "@shiplightai/quality-core/gap-triage";

// Pure gap-detail helpers used by the feature page's per-check Gaps block. Kept out of the
// "use client" FeaturePage component so they can be unit-tested in isolation (spec 045).

// Key a gap record back to its check by the expectation localId. GapRecord.expectationId is the fully
// qualified "…#expectation:<localId>" form; splitting yields the trailing localId. If the id is not
// qualified (no "#expectation:" segment) the raw id is returned as a last resort — it simply won't
// match any check's localId, so the gap is left unattached rather than mis-attached.
export function gapExpectationLocalId(record: GapRecord): string {
  return record.expectationId.split("#expectation:").at(-1) ?? record.expectationId;
}

// The exact commands + test paths that would prove this gap (mirrors the old DetailPanel's
// "Verification checks" field): dedup the evidence commands and paths, drop empties/whitespace, cap
// at 8 so the list stays scannable.
export function verificationChecks(gap: GapRecord): readonly string[] {
  const nonEmpty = (value: string | undefined): value is string => typeof value === "string" && value.trim().length > 0;
  const commands = gap.evidence.map((entry) => entry.command).filter(nonEmpty);
  const paths = gap.evidence.map((entry) => entry.path).filter(nonEmpty);
  return Array.from(new Set([...commands, ...paths])).slice(0, 8);
}
