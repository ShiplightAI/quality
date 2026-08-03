import type { GapNavigationContext, GapRecord } from "./types";

export function createGapNavigationContext(
  record: GapRecord,
  destinationKind: GapNavigationContext["destinationKind"]
): GapNavigationContext {
  return {
    destinationKind,
    targetId: record.targetId,
    expectationId: record.expectationId,
    evidenceId: record.evidence[0]?.evidenceId,
    gapId: record.gapId,
    category: record.category,
    sourceClassification: record.sourceClassification,
    sourceReferences: record.sourceReferences
  };
}
