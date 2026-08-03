import { describe, expect, it } from "vitest";
import {
  buildOwnerView,
  createEvidenceDrilldownContext,
  groupOwnerExpectations
} from "@shiplightai/quality-core";
import { ownerFallbackResult, ownerStructuredResult } from "../fixtures/owner-view/build-fixtures";

describe("owner view selectors", () => {
  it("builds priority-first structured expectations without implementation-heavy defaults", () => {
    const view = buildOwnerView({
      result: ownerStructuredResult(),
      targetId: "owner/quality-map.yaml#target:owner-target"
    });

    expect(view.state).toBe("ready");
    expect(view.summary.displayName).toBe("Owner Target");
    expect(view.expectationGroups.map((group) => group.priority)).toEqual(["P0", "P1", "unknown"]);
    expect(view.expectations.map((expectation) => expectation.title)).toEqual([
      "P0 checkout remains available",
      "P1 risk is visible",
      "Unknown priority remains visible"
    ]);
    expect(view.expectations[0]?.riskBadge).toBe("Covered");
    expect(view.expectations[1]?.riskBadge).toBe("Gap");
    expect(view.expectations[2]?.priority).toBe("unknown");
    expect(view.expectations.some((expectation) => expectation.description.includes("tests/"))).toBe(false);
  });

  it("renders fallback owner-readable sections when no structured target exists", () => {
    const view = buildOwnerView({
      result: ownerFallbackResult(),
      targetId: "owner-fallback"
    });

    expect(view.state).toBe("ready");
    expect(view.summary.sourceClassification).toBe("parsed_markdown_fallback");
    expect(view.expectations.map((expectation) => expectation.sourceClassification)).toContain(
      "parsed_markdown_fallback"
    );
    expect(view.expectations.map((expectation) => expectation.title)).toEqual(
      expect.arrayContaining(["Testing What", "Summary", "Coverage Matrix"])
    );
  });

  it("keeps missing targets and direct opens recoverable", () => {
    expect(buildOwnerView({ result: ownerStructuredResult(), targetId: "missing" }).state).toBe(
      "missingTarget"
    );
    expect(buildOwnerView({ targetId: "owner-target" }).state).toBe("directOpen");
  });

  it("preserves evidence drilldown context", () => {
    const view = buildOwnerView({
      result: ownerStructuredResult(),
      targetId: "owner/quality-map.yaml#target:owner-target"
    });
    const drilldown = createEvidenceDrilldownContext(view.summary, view.expectations[0]!);

    expect(drilldown).toMatchObject({
      targetId: "owner/quality-map.yaml#target:owner-target",
      expectationId: "owner/quality-map.yaml#expectation:p0-covered",
      sourceClassification: "structured_quality_map"
    });
  });

  it("groups unknown priorities after explicit priorities", () => {
    const view = buildOwnerView({
      result: ownerStructuredResult(),
      targetId: "owner/quality-map.yaml#target:owner-target"
    });

    expect(groupOwnerExpectations(view.expectations).at(-1)?.priority).toBe("unknown");
  });
});
