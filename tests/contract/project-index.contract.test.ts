import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMarkdownFallbackBatch,
  buildProjectIndex,
  createTargetNavigationContext,
  detectSourceClassificationChanges
} from "@shiplightai/quality-core";
import { parseQualityMaps } from "@shiplightai/quality-map";
import { markdownArtifactSource } from "../fixtures/markdown-fallback/build-fixtures";
import { projectIndexScanResult } from "../fixtures/project-index/build-fixtures";

function structuredAndFallbackResult() {
  const qualityMaps = parseQualityMaps([
    {
      projectRelativePath: ".quality/evidence/project/quality-map.yaml",
      resolvedLocalPath: path.resolve("tests/fixtures/quality-map/complete/quality-map.yaml"),
      targetCandidateId: ".quality/evidence/project",
      sourcePattern: "test"
    }
  ]);
  const markdownFallback = buildMarkdownFallbackBatch({
    sources: [
      markdownArtifactSource("markdown-only/test-spec.md", "test_spec", "specs/markdown-only"),
      markdownArtifactSource(
        "markdown-only/test-report.md",
        "test_report",
        "specs/markdown-only"
      )
    ],
    qualityMaps
  });

  return projectIndexScanResult({ qualityMaps, markdownFallback });
}

describe("project index selectors", () => {
  it("builds unique, ordered target rows for structured and fallback targets", () => {
    const index = buildProjectIndex({ result: structuredAndFallbackResult() });

    expect(index.state).toBe("partialDiagnostics");
    expect(index.targets.map((target) => target.targetId)).toEqual([
      ".quality/evidence/project/quality-map.yaml#target:checkout-quality",
      "specs/markdown-only"
    ]);
    expect(index.targets.map((target) => target.sourceClassification)).toEqual([
      "structured_quality_map",
      "parsed_markdown_fallback"
    ]);
    expect(index.targets[0]).toMatchObject({
      displayName: "Checkout Quality",
      scope: "feature",
      mapAvailability: "available"
    });
    expect(index.targets[1]).toMatchObject({
      displayName: "Markdown Only Target",
      scope: "unknown",
      mapAvailability: "unavailable"
    });
  });

  it("lifts a structured (no project-map feature) target to HIGH when its check list is reviewed", () => {
    // No project-map feature backs this structured target, so gate 2 is vacuously
    // confirmed and the graph's checks_reviewed flag alone drives the lift.
    const base = structuredAndFallbackResult();
    const reviewed: ReturnType<typeof structuredAndFallbackResult> = {
      ...base,
      qualityMaps: {
        ...base.qualityMaps,
        results: base.qualityMaps.results.map((entry) =>
          entry.graph === undefined ? entry : { ...entry, graph: { ...entry.graph, checksReviewed: true } }
        )
      }
    };
    const labelOf = (result: ReturnType<typeof structuredAndFallbackResult>) =>
      buildProjectIndex({ result }).targets[0]?.structureConfidence;

    expect(labelOf(base)).toBe("UNSPECIFIED"); // unreviewed: origin label
    expect(labelOf(reviewed)).toBe("HIGH"); // gate 4 alone lifts it
  });

  it("uses unavailable labels when optional metadata is missing", () => {
    const index = buildProjectIndex({ result: structuredAndFallbackResult() });

    expect(index.targets.every((target) => target.status.length > 0)).toBe(true);
    expect(index.targets.every((target) => target.evidenceConfidence.length > 0)).toBe(true);
    expect(index.targets[1]?.scope).toBe("unknown");
  });

  it("summarizes diagnostics from scan, quality-map, and Markdown fallback sources", () => {
    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: "invalid/wrong-shape.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/quality-map/invalid/wrong-shape.yaml"),
        targetCandidateId: "invalid-map",
        sourcePattern: "test"
      }
    ]);
    const markdownFallback = buildMarkdownFallbackBatch({
      sources: [
        markdownArtifactSource("diagnostics/empty/test-spec.md", "test_spec", "empty-markdown")
      ],
      qualityMaps
    });
    const result = projectIndexScanResult({
      qualityMaps,
      markdownFallback,
      diagnostics: [
        {
          severity: "warning",
          code: "UNREADABLE_DIRECTORY",
          message: "Directory warning.",
          affectedPath: ".quality/evidence/blocked"
        }
      ],
      status: "partial"
    });
    const index = buildProjectIndex({ result });

    expect(index.state).toBe("partialDiagnostics");
    expect(index.diagnostics.severityCounts.error).toBeGreaterThanOrEqual(1);
    expect(index.diagnostics.severityCounts.warning).toBe(1);
    expect(index.diagnostics.severityCounts.info).toBe(1);
    expect(index.diagnostics.details.map((detail) => detail.code)).toEqual(
      expect.arrayContaining([
        "UNREADABLE_DIRECTORY",
        "INVALID_FIELD_SHAPE",
        "EMPTY_MARKDOWN_ARTIFACT"
      ])
    );
  });

  it("preserves navigation context for owner and evidence destinations", () => {
    const index = buildProjectIndex({ result: structuredAndFallbackResult() });
    const owner = createTargetNavigationContext(index.targets[0]!, "owner");
    const evidence = createTargetNavigationContext(index.targets[1]!, "evidence");

    expect(owner).toMatchObject({
      destinationKind: "owner",
      targetId: ".quality/evidence/project/quality-map.yaml#target:checkout-quality",
      sourceClassification: "structured_quality_map"
    });
    expect(evidence).toMatchObject({
      destinationKind: "evidence",
      targetId: "specs/markdown-only",
      sourceClassification: "parsed_markdown_fallback"
    });
  });

  it("detects source classification changes between refresh results", () => {
    const previous = buildProjectIndex({ result: structuredAndFallbackResult() });
    const nextQualityMaps = parseQualityMaps([]);
    const nextFallback = buildMarkdownFallbackBatch({
      sources: [
        markdownArtifactSource("markdown-only/test-spec.md", "test_spec", ".quality/evidence/project")
      ],
      qualityMaps: nextQualityMaps
    });
    const next = buildProjectIndex({
      result: projectIndexScanResult({
        qualityMaps: nextQualityMaps,
        markdownFallback: nextFallback
      })
    });

    expect(detectSourceClassificationChanges(previous, next)).toContainEqual(
      expect.objectContaining({
        code: "TARGET_SOURCE_CLASSIFICATION_CHANGED",
        severity: "info"
      })
    );
  });
});
