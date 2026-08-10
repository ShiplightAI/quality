import { describe, expect, it } from "vitest";
import {
  applyAnalyticsFilters,
  buildAnalyticsView
} from "@shiplightai/quality-core";
import { analyticsStructuredResult } from "../fixtures/analytics/build-fixtures";

const targetId = "complete/quality-map.yaml#target:analytics-target";

describe("analytics release-confidence selectors", () => {
  it("computes mandatory release-confidence snapshot metrics with formulas and guardrails", () => {
    const view = buildAnalyticsView({ result: analyticsStructuredResult(), targetId });
    const direct = view.metrics.find((metric) => metric.metricId === "p0p1-direct-evidence");
    const gated = view.metrics.find((metric) => metric.metricId === "p0p1-gated-evidence");

    expect(view.state).toBe("ready");
    // hasAutomatedEvidence is now "has any automated evidence type" (depth removed).
    // Of the 7 P0/P1 expectations, four carry an automated type: p0-direct-gated
    // (contract), p1-ungated (integration), p1-stale (e2e), p1-accepted (contract).
    expect(direct).toMatchObject({
      numerator: 4,
      denominator: 7,
      valueLabel: "4/7 (57%)",
      availability: "partial"
    });
    expect(gated).toMatchObject({
      numerator: 3,
      denominator: 7
    });
    expect(view.guardrails.join(" ")).toContain("No single readiness score");
  });

  it("counts stale, manual-only, missing, accepted, and deferred contexts", () => {
    const view = buildAnalyticsView({ result: analyticsStructuredResult(), targetId });
    const byId = new Map(view.metrics.map((metric) => [metric.metricId, metric]));

    expect(byId.get("stale-evidence")?.numerator).toBe(1);
    expect(byId.get("manual-only-exposure")?.numerator).toBe(2);
    expect(byId.get("missing-evidence")?.numerator).toBe(1);
    expect(byId.get("accepted-risks")?.numerator).toBe(1);
    expect(byId.get("deferred-risks")?.numerator).toBeGreaterThanOrEqual(1);
  });

  it("labels non-P0/P1 vocabulary unavailable when no mapping exists", () => {
    const view = buildAnalyticsView({
      result: analyticsStructuredResult("non-p0p1/quality-map.yaml"),
      targetId: "non-p0p1/quality-map.yaml#target:analytics-non-p0p1"
    });
    const direct = view.metrics.find((metric) => metric.metricId === "p0p1-direct-evidence");

    expect(direct?.availability).toBe("unavailable");
    expect(direct?.denominator).toBe(0);
  });

  it("keeps analytics structural-only and does not expose source-supplied runtime confidence", () => {
    const view = buildAnalyticsView({ result: analyticsStructuredResult(), targetId });

    expect(view.metrics.some((metric) => metric.metricId === "source-supplied-confidence")).toBe(false);
    expect(view.guardrails).toContain("Freshness and pass/fail outcomes are outside this structural-only view.");
  });

  it("selects metric drilldowns and applies analytics filters", () => {
    const view = buildAnalyticsView({
      result: analyticsStructuredResult(),
      targetId,
      selectedMetricId: "p0p1-gated-evidence",
      filters: { gating: "gated" }
    });

    expect(view.filteredMetric?.drilldownRecords.every((record) => record.gatingState === "gated")).toBe(true);
    expect(applyAnalyticsFilters(view.selectedMetric?.drilldownRecords ?? [], { priority: "P0" }).every(
      (record) => record.priority === "P0"
    )).toBe(true);
  });

  it("compares only when explicit baseline identity is present", () => {
    const withBaseline = buildAnalyticsView({ result: analyticsStructuredResult(), targetId });
    const noBaseline = buildAnalyticsView({
      result: analyticsStructuredResult("no-baseline/quality-map.yaml"),
      targetId: "no-baseline/quality-map.yaml#target:analytics-no-baseline"
    });

    expect(withBaseline.baselineComparison).toMatchObject({
      state: "available",
      baselineId: "release-2026-05"
    });
    expect(noBaseline.baselineComparison.state).toBe("unavailable");
  });
});
