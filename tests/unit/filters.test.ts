import { describe, expect, it } from "vitest";
import {
  applyAnalyticsFilters,
  applyGapFilters,
  groupGapRecords,
  summarizeGapRecords,
  type GapRecord,
  type MetricDrilldownRecord
} from "@shiplightai/quality-core";

function analyticsRecord(
  recordId: string,
  overrides: Partial<MetricDrilldownRecord> = {}
): MetricDrilldownRecord {
  return {
    recordId,
    recordType: "expectation",
    label: recordId,
    targetId: "target",
    priority: "P1",
    evidenceState: "PASS",
    gatingState: "gated",
    reasonIncluded: "unit fixture",
    sourceClassification: "structured_quality_map",
    ...overrides
  };
}

function gapRecord(recordId: string, overrides: Partial<GapRecord> = {}): GapRecord {
  return {
    gapId: recordId,
    category: "missing",
    categoryLabel: "Missing evidence",
    targetId: "target",
    expectationId: `${recordId}-expectation`,
    expectationTitle: recordId,
    priority: "P1",
    expectationCategory: "release",
    evidenceState: "NOT RUN",
    evidenceDepth: "MISSING",
    evidence: [],
    residualRisk: "unavailable",
    nextProof: { availability: "unavailable", text: "unavailable" },
    sourceClassification: "structured_quality_map",
    sourceReferences: [],
    diagnostics: [],
    relatedCategoryIds: [],
    ...overrides
  };
}

describe("pure filter helpers", () => {
  it("applies analytics filters conjunctively without mutating records", () => {
    const records = [
      analyticsRecord("kept", { gapCategory: "missing", riskState: "accepted" }),
      analyticsRecord("wrong-priority", { priority: "P2", gapCategory: "missing", riskState: "accepted" }),
      analyticsRecord("wrong-gating", { gapCategory: "missing", gatingState: "ungated", riskState: "accepted" }),
      analyticsRecord("wrong-risk", { gapCategory: "missing", riskState: "deferred" })
    ];

    expect(
      applyAnalyticsFilters(records, {
        gapCategory: "missing",
        gating: "gated",
        priority: "P1",
        riskState: "accepted",
        sourceClassification: "structured_quality_map"
      }).map((record) => record.recordId)
    ).toEqual(["kept"]);
    expect(records).toHaveLength(4);
  });

  it("filters gap records by category, evidence state, source, and residual-risk availability", () => {
    const records = [
      gapRecord("kept", { category: "failing", evidenceState: "FAIL", residualRisk: "open risk" }),
      gapRecord("wrong-category", { category: "manual-only", evidenceState: "FAIL", residualRisk: "open risk" }),
      gapRecord("wrong-state", { category: "failing", evidenceState: "PASS", residualRisk: "open risk" }),
      gapRecord("no-risk", { category: "failing", evidenceState: "FAIL", residualRisk: "unavailable" })
    ];

    expect(
      applyGapFilters(records, {
        category: "failing",
        evidenceState: "FAIL",
        residualRisk: "with-risk",
        sourceClassification: "structured_quality_map"
      }).map((record) => record.gapId)
    ).toEqual(["kept"]);
  });

  it("groups and summarizes gaps in product category order", () => {
    const records = [
      gapRecord("manual", { category: "manual-only", categoryLabel: "Manual-only evidence" }),
      gapRecord("missing", { category: "missing", categoryLabel: "Missing evidence" }),
      gapRecord("another-missing", { category: "missing", categoryLabel: "Missing evidence" })
    ];

    expect(groupGapRecords(records).map((group) => [group.category, group.records.length])).toEqual([
      ["missing", 2],
      ["manual-only", 1]
    ]);
    expect(summarizeGapRecords(records)).toEqual([
      { category: "missing", count: 2, label: "Missing evidence" },
      { category: "manual-only", count: 1, label: "Manual-only evidence" }
    ]);
  });
});
