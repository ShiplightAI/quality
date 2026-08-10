import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { buildAnalyticsView } from "@shiplightai/quality-core";
import {
  analyticsQualityMapSource,
  analyticsStructuredResult,
  buildLargeAnalyticsQualityMap
} from "../fixtures/analytics/build-fixtures";
import { parseQualityMaps } from "@shiplightai/quality-map";
import { buildMarkdownFallbackBatch } from "@shiplightai/quality-core";
import { projectIndexScanResult } from "../fixtures/project-index/build-fixtures";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

const targetId = "complete/quality-map.yaml#target:analytics-target";

describe("analytics integration", () => {
  it("computes analytics without mutating source artifacts or uploading data", async () => {
    const source = analyticsQualityMapSource();
    const before = await stat(source.resolvedLocalPath);
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      throw new Error("External upload is not allowed.");
    }) as typeof fetch;

    try {
      const view = buildAnalyticsView({ result: analyticsStructuredResult(), targetId });
      expect(view.metrics).toHaveLength(7);
      expect(view.riskSummary.acceptedRisks).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const after = await stat(source.resolvedLocalPath);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(fetchCalled).toBe(false);
  });

  it("handles missing selected metrics with recoverable state", () => {
    const view = buildAnalyticsView({
      result: analyticsStructuredResult(),
      targetId,
      selectedMetricId: "missing-metric"
    });

    expect(view.missingSelection?.metricId).toBe("missing-metric");
  });

  it("computes 1000 drilldown records under the target budget", async () => {
    const fixture = await createFixtureProject("analytics-large-integration", [
      {
        relativePath: "large/quality-map.yaml",
        contents: buildLargeAnalyticsQualityMap(1000)
      }
    ]);

    try {
      const qualityMaps = parseQualityMaps([
        {
          projectRelativePath: "large/quality-map.yaml",
          resolvedLocalPath: `${fixture.root}/large/quality-map.yaml`,
          targetCandidateId: "large",
          sourcePattern: "test"
        }
      ]);
      const result = projectIndexScanResult({
        qualityMaps,
        markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
      });
      const started = performance.now();
      const view = buildAnalyticsView({
        result,
        targetId: "large/quality-map.yaml#target:large-analytics",
        selectedMetricId: "p0p1-direct-evidence"
      });
      const elapsed = performance.now() - started;

      expect(view.selectedMetric?.denominator).toBe(1000);
      expect(elapsed).toBeLessThan(2000);
    } finally {
      await fixture.cleanup();
    }
  });
});
