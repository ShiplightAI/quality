import { describe, expect, it } from "vitest";
import {
  applyGapFilters,
  buildGapTriage,
  createGapNavigationContext
} from "@shiplightai/quality-core";
import {
  gapFallbackResult,
  gapStructuredResult
} from "../fixtures/gap-triage/build-fixtures";

const targetId = "complete/quality-map.yaml#target:gap-target";

describe("gap triage selectors", () => {
  it("groups attention-needed gaps by category without computing analytics", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });

    expect(view.state).toBe("ready");
    // "failing" was derived from the removed evidence reliability field; the
    // structured path no longer produces it (failing runs surface via
    // observations, not the map), so it is no longer an expected structured group.
    expect(view.groups.map((group) => group.category)).toEqual(
      expect.arrayContaining([
        "missing",
        "stale",
        "deferred",
        "manual-only",
        "weak",
        "unavailable"
      ])
    );
    expect(view.summaries.map((summary) => summary.label).join(" ")).not.toMatch(/score|roi|trend/i);
  });

  it("classifies weak evidence only when direct passing evidence is absent", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });
    const weakTitles = view.records
      .filter((record) => record.category === "weak")
      .map((record) => record.expectationTitle);

    expect(weakTitles).toEqual(
      expect.arrayContaining([
        "Manual only expectation",
        "Static only expectation",
        "Indirect expectation",
        "Unknown depth expectation"
      ])
    );
    expect(weakTitles).not.toContain("Direct proof suppresses weak classification");
  });

  it("uses explicit stale source context and does not infer stale from old timestamps", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });
    const staleTitles = view.records
      .filter((record) => record.category === "stale")
      .map((record) => record.expectationTitle);

    expect(staleTitles).toEqual(expect.arrayContaining(["Stale expectation", "Multi category expectation"]));
    expect(staleTitles).not.toContain("Old timestamp without stale marker");
    expect(staleTitles).not.toContain("Covered stale-cache wording expectation");
    expect(view.records.map((record) => record.expectationTitle)).not.toContain("Covered stale-cache wording expectation");
  });

  it("places one expectation in each applicable category with stable identity links", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });
    const records = view.records.filter((record) => record.expectationTitle === "Multi category expectation");

    expect(records.map((record) => record.category)).toEqual(
      expect.arrayContaining(["stale", "deferred", "manual-only", "weak"])
    );
    expect(new Set(records.map((record) => record.expectationId)).size).toBe(1);
    expect(records.every((record) => record.relatedCategoryIds.includes("stale"))).toBe(true);
  });

  it("filters category, priority, source classification, and residual risk", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });
    const filtered = applyGapFilters(view.records, {
      category: "missing",
      priority: "P0",
      sourceClassification: "structured_quality_map",
      residualRisk: "with-risk"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.expectationTitle).toBe("Missing evidence expectation");
  });

  it("preserves recommended action unavailable state and fallback source labels", () => {
    const structured = buildGapTriage({ result: gapStructuredResult(), targetId });
    const manual = structured.records.find((record) => record.expectationTitle === "Manual only expectation");
    const fallback = buildGapTriage({ result: gapFallbackResult(), targetId: "fallback-gap" });

    expect(manual?.nextProof).toMatchObject({
      availability: "unavailable",
      text: "No source-provided recommended action"
    });
    expect(fallback.summary.sourceClassification).toBe("parsed_markdown_fallback");
    expect(fallback.records.some((record) => record.sourceClassification === "parsed_markdown_fallback")).toBe(true);
  });

  it("creates owner and evidence navigation contexts from gap records", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });
    const record = view.records.find((candidate) => candidate.evidence.length > 0)!;

    expect(createGapNavigationContext(record, "owner")).toMatchObject({
      destinationKind: "owner",
      targetId,
      expectationId: record.expectationId,
      category: record.category
    });
    expect(createGapNavigationContext(record, "evidence")).toMatchObject({
      destinationKind: "evidence",
      evidenceId: record.evidence[0]?.evidenceId
    });
  });

  it("preserves structured evidence paths and commands for fix prompts", () => {
    const view = buildGapTriage({ result: gapStructuredResult(), targetId });
    const command = view.records.find((record) => record.expectationTitle === "Command evidence expectation");
    const failing = view.records.find((record) => record.expectationTitle === "Failing expectation");

    expect(command?.evidence[0]).toMatchObject({
      command: "pnpm test -- command-evidence",
      pathOrUrl: "pnpm test -- command-evidence"
    });
    expect(failing?.evidence[0]).toMatchObject({
      path: "tests/contract/failing.test.ts",
      pathOrUrl: "tests/contract/failing.test.ts"
    });
  });
});
