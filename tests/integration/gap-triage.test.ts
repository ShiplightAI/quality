import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildGapTriage
} from "@shiplightai/quality-core";
import {
  gapQualityMapSource,
  gapStructuredResult
} from "../fixtures/gap-triage/build-fixtures";

const targetId = "complete/quality-map.yaml#target:gap-target";

describe("gap triage integration", () => {
  it("renders gap context without mutating source artifacts or uploading data", async () => {
    const source = gapQualityMapSource();
    const before = await stat(source.resolvedLocalPath);
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      throw new Error("External upload is not allowed.");
    }) as typeof fetch;

    try {
      const view = buildGapTriage({ result: gapStructuredResult(), targetId });

      expect(view.records.length).toBeGreaterThan(10);
      expect(view.records.some((record) => record.nextProof.text === "No source-provided recommended action")).toBe(true);
      expect(view.records.some((record) => record.residualRisk.includes("Blocked"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const after = await stat(source.resolvedLocalPath);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(fetchCalled).toBe(false);
  });

  it("returns clear empty and missing-selection states", () => {
    const noGaps = buildGapTriage({
      result: gapStructuredResult(),
      targetId,
      filters: { category: "missing", priority: "P9" }
    });
    const missingSelection = buildGapTriage({
      result: gapStructuredResult(),
      targetId,
      selectedGapId: "missing-gap"
    });

    expect(noGaps.filteredRecords).toEqual([]);
    expect(noGaps.groups).toEqual([]);
    expect(missingSelection.missingSelection?.gapId).toBe("missing-gap");
  });

  it("never emits the failing gap category from the structured path without a runtime failure", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });

    // The structured quality map carries automated evidence and no runtime
    // failure is joined, so the type-derived path must not surface "failing"
    // (that category is only produced by the markdown-fallback path).
    expect(view.records.length).toBeGreaterThan(0);
    expect(view.records.some((record) => record.category === "failing")).toBe(false);
  });

  it("keeps diagnostics and existing evidence context visible with gaps", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });
    const blocked = view.records.find((record) => record.category === "blocked");

    // depth is the type-derived proof tier (integration -> "automated").
    expect(blocked?.evidence[0]).toMatchObject({
      label: "blocked-proof",
      depth: "automated"
    });
    expect(blocked?.residualRisk).toBe("Blocked by unavailable staging credentials.");
  });
});
