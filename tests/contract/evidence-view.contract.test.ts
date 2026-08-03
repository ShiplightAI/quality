import { describe, expect, it } from "vitest";
import {
  buildEvidenceDrawer,
  buildEvidenceView
} from "@shiplightai/quality-core";
import {
  evidenceFallbackResult,
  evidenceStructuredResult,
  evidenceStructuredResultWithSharedCanonical
} from "../fixtures/evidence-view/build-fixtures";

const structuredTargetId = "complete/quality-map.yaml#target:evidence-target";
const selectedExpectationId = "complete/quality-map.yaml#expectation:owner-drilldown";

describe("evidence view selectors", () => {
  it("builds traceable structured relationships for expectations, tasks, evidence, results, artifacts, and risk", () => {
    const view = buildEvidenceView({
      result: evidenceStructuredResult(),
      targetId: structuredTargetId
    });

    expect(view.state).toBe("ready");
    expect(view.summary.displayName).toBe("Evidence Target");
    expect(view.expectationGroups).toHaveLength(3);
    expect(view.relationships.map((relationship) => relationship.kind)).toEqual(
      expect.arrayContaining([
        "target-expectation",
        "expectation-task",
        "expectation-evidence",
        "latest-result-artifact",
        "expectation-residual-risk"
      ])
    );
    expect(view.canonicalEvidence.map((evidence) => evidence.localId)).toEqual([
      "contract-proof",
      "state-disagreement",
      "e2e-proof"
    ]);
    expect(view.expectationGroups[2]?.rows[0]?.evidenceType).toBe("missing");
  });

  it("preserves selected expectation focus while keeping full target evidence", () => {
    const view = buildEvidenceView({
      result: evidenceStructuredResult(),
      targetId: structuredTargetId,
      selectedExpectationId
    });

    expect(view.expectationGroups.find((group) => group.isSelected)?.expectationId).toBe(
      selectedExpectationId
    );
    expect(view.canonicalEvidence).toHaveLength(3);
  });

  it("uses one canonical evidence record for shared stable evidence identities", () => {
    const view = buildEvidenceView({
      result: evidenceStructuredResultWithSharedCanonical(),
      targetId: structuredTargetId
    });
    const canonical = view.canonicalEvidence.find((evidence) => evidence.localId === "contract-proof");

    expect(view.canonicalEvidence.filter((evidence) => evidence.localId === "contract-proof")).toHaveLength(1);
    expect(canonical?.linkedExpectationIds).toEqual(
      expect.arrayContaining([
        "complete/quality-map.yaml#expectation:checkout",
        "complete/quality-map.yaml#expectation:owner-drilldown"
      ])
    );
  });

  it("builds drawer models with unavailable labels, latest results, artifacts, diagnostics, and context", () => {
    const view = buildEvidenceView({
      result: evidenceStructuredResult(),
      targetId: structuredTargetId
    });
    const drawer = buildEvidenceDrawer({
      view,
      evidenceId: "complete/quality-map.yaml#evidence:state-disagreement",
      expectationId: "complete/quality-map.yaml#expectation:checkout"
    });

    expect(drawer?.state).toBe("ready");
    expect(drawer?.fields).toContainEqual({ label: "Command", value: "pnpm test -- tests/integration/evidence-view.test.ts" });
    expect(drawer?.artifacts[0]).toMatchObject({
      clickableFileLink: true,
      href: "file://reports/evidence/state-disagreement.log",
      availability: "unverified"
    });
    expect(drawer?.diagnostics).toEqual([]);
  });

  it("renders parsed Markdown fallback evidence hints distinctly", () => {
    const view = buildEvidenceView({
      result: evidenceFallbackResult(),
      targetId: "fallback-evidence"
    });

    expect(view.state).toBe("ready");
    expect(view.summary.sourceClassification).toBe("parsed_markdown_fallback");
    expect(view.expectationGroups.map((group) => group.sourceClassification)).toContain(
      "parsed_markdown_fallback"
    );
    expect(view.canonicalEvidence.some((evidence) => evidence.type === "path")).toBe(true);
  });

  it("reports recoverable missing selections instead of stale evidence", () => {
    const view = buildEvidenceView({
      result: evidenceStructuredResult(),
      targetId: structuredTargetId,
      selectedEvidenceId: "missing-evidence"
    });

    expect(view.missingSelection?.evidenceId).toBe("missing-evidence");
    expect(buildEvidenceDrawer({ view, evidenceId: "missing-evidence" })?.state).toBe(
      "missingEvidence"
    );
  });
});
