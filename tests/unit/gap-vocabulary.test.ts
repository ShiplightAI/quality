import { describe, expect, it } from "vitest";
import { GAP_CATEGORIES, gapCategoryOrder, riskBadgeFor } from "@shiplightai/quality-core";

describe("gap category vocabulary", () => {
  // `gapCategoryOrder` is typed `readonly GapCategory[]`, so an omission is not a type
  // error. Both classifier paths end in `gapCategoryOrder.filter(...)`, so a category
  // present in GAP_CATEGORIES but missing here is silently dropped from every gap
  // record and every triage group — a whole class of gaps disappearing with no signal.
  it("orders exactly the canonical gap categories", () => {
    expect([...gapCategoryOrder].sort()).toEqual([...GAP_CATEGORIES].sort());
  });
});

describe("owner risk badge", () => {
  // Markdown-fallback rows copy the Result / Confidence / Residual Risk cells verbatim
  // from the scanned project, so these inputs are attacker-controlled in the sense that
  // matters here: the project being scored writes them. A stated non-passing result must
  // never be promoted to Covered by a confidence claim sitting beside it.
  it("does not let a confidence claim promote a stated non-passing result", () => {
    expect(riskBadgeFor({ status: "BLOCKED", evidenceConfidence: "HIGH", residualRisk: "None", hasEvidence: true }))
      .toBe("Gap");
    expect(riskBadgeFor({ status: "FAIL", evidenceConfidence: "HIGH", residualRisk: "None", hasEvidence: true }))
      .toBe("Gap");
    expect(riskBadgeFor({ status: "SKIPPED", evidenceConfidence: "HIGH", residualRisk: "None", hasEvidence: true }))
      .toBe("Unknown");
  });

  it("keeps a blocked row a gap whatever confidence the report claims", () => {
    for (const evidenceConfidence of ["HIGH", "MEDIUM", "LOW", undefined]) {
      expect(riskBadgeFor({ status: "BLOCKED", evidenceConfidence, residualRisk: "None", hasEvidence: true }))
        .toBe("Gap");
    }
  });

  it("still settles a row that states no result of its own by confidence", () => {
    expect(riskBadgeFor({ status: undefined, evidenceConfidence: "HIGH", residualRisk: "None", hasEvidence: true }))
      .toBe("Covered");
    expect(riskBadgeFor({ status: "", evidenceConfidence: "LOW", residualRisk: "None", hasEvidence: true }))
      .toBe("Unknown");
  });

  it("keeps the structured assessment statuses on their existing badges", () => {
    expect(riskBadgeFor({ status: "COVERED", evidenceConfidence: "HIGH", residualRisk: "None", hasEvidence: true }))
      .toBe("Covered");
    expect(riskBadgeFor({ status: "PARTIAL", evidenceConfidence: "MEDIUM", residualRisk: "None", hasEvidence: true }))
      .toBe("Gap");
    expect(riskBadgeFor({ status: "NOT COVERED", evidenceConfidence: "LOW", residualRisk: "None", hasEvidence: false }))
      .toBe("Missing");
  });
});
