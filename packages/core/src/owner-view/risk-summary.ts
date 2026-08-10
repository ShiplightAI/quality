import type { OwnerExpectation, OwnerRiskBadge, OwnerRiskSummary } from "./types";

export function riskBadgeFor(input: {
  readonly status?: string;
  readonly evidenceConfidence?: string;
  readonly residualRisk?: string;
  readonly hasEvidence?: boolean;
}): OwnerRiskBadge {
  const status = input.status?.toUpperCase() ?? "";

  // Markdown-fallback rows carry the Result cell verbatim from the scanned project,
  // so any stated-but-not-passing result arrives here as a producer claim. "BLOCK"
  // is still such a claim even though the blocked gap category is gone — it maps to
  // the surviving Gap vocabulary rather than being dropped.
  if (status.includes("FAIL") || status.includes("BLOCK")) {
    return "Gap";
  }

  if (status.includes("PARTIAL") || (input.residualRisk !== undefined && input.residualRisk !== "None")) {
    return "Gap";
  }

  if (input.hasEvidence === false) {
    return "Missing";
  }

  if (status.includes("COVER") || status.includes("PASS")) {
    return "Covered";
  }

  // Confidence may only settle a row that states no result of its own. The scanned
  // project controls this text, so a high-confidence claim must never promote an
  // unrecognized status to Covered.
  if (status.length === 0 && input.evidenceConfidence?.toUpperCase() === "HIGH") {
    return "Covered";
  }

  return "Unknown";
}

export function summarizeOwnerRisk(expectations: readonly OwnerExpectation[]): OwnerRiskSummary {
  const badgeCounts: Partial<Record<OwnerRiskBadge, number>> = {};
  for (const expectation of expectations) {
    badgeCounts[expectation.riskBadge] = (badgeCounts[expectation.riskBadge] ?? 0) + 1;
  }

  return {
    badgeCounts,
    residualRisks: expectations
      .map((expectation) => expectation.residualRisk)
      .filter((risk) => risk !== "unavailable" && risk !== "None")
  };
}
