import type {
  EvidenceDrilldownContext,
  OwnerExpectation,
  OwnerTargetSummary
} from "./types";

export function createEvidenceDrilldownContext(
  summary: OwnerTargetSummary,
  expectation: OwnerExpectation
): EvidenceDrilldownContext {
  return {
    targetId: summary.targetId,
    expectationId: expectation.expectationId,
    expectationTitle: expectation.title,
    sourceClassification: expectation.sourceClassification,
    sourceReferences: expectation.sourceReferences.length === 0
      ? summary.sourceReferences
      : expectation.sourceReferences
  };
}
