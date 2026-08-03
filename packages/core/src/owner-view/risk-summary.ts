import type { OwnerExpectation, OwnerRiskBadge, OwnerRiskSummary } from "./types";

export function riskBadgeFor(input: {
  readonly status?: string;
  readonly evidenceConfidence?: string;
  readonly residualRisk?: string;
  readonly hasEvidence?: boolean;
}): OwnerRiskBadge {
  const status = input.status?.toUpperCase() ?? "";

  if (status.includes("BLOCK")) {
    return "Blocked";
  }

  if (status.includes("FAIL")) {
    return "Gap";
  }

  if (status.includes("PARTIAL") || (input.residualRisk !== undefined && input.residualRisk !== "None")) {
    return "Gap";
  }

  if (input.hasEvidence === false) {
    return "Missing";
  }

  if (status.includes("COVER") || status.includes("PASS") || input.evidenceConfidence?.toUpperCase() === "HIGH") {
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
