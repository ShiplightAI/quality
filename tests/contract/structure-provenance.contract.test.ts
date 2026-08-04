import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMarkdownFallbackBatch, buildOwnerView, buildProjectIndex, buildWorkspace } from "@shiplightai/quality-core";
import {
  normalizeQualityMap,
  parseQualityMaps,
  validateQualityMap,
  type ParsedQualityMap
} from "@shiplightai/quality-map";
import { projectIndexScanResult } from "../fixtures/project-index/build-fixtures";

function provenanceQualityMaps() {
  return parseQualityMaps([
    {
      projectRelativePath: ".quality/evidence/provenance-target/quality-map.yaml",
      resolvedLocalPath: path.resolve("tests/fixtures/quality-map/structure-provenance/quality-map.yaml"),
      targetCandidateId: ".quality/evidence/provenance-target",
      sourcePattern: "test"
    }
  ]);
}

function provenanceProjectMap(featureStatus: string = "verified") {
  return {
    source: {
      projectRelativePath: ".quality/project-map.yaml",
      resolvedLocalPath: "/fixture/.quality/project-map.yaml"
    },
    status: "parsed" as const,
    rawText: "",
    diagnostics: [],
    map: {
      project: {
        id: "provenance-project",
        name: "Provenance Project",
        summary: "Project used to exercise structure confidence.",
        sourceRefs: []
      },
      featureOrder: ["001-provenance"],
      features: [
        {
          id: "001-provenance",
          name: "Provenance Feature",
          status: featureStatus,
          priority: "P1",
          priorityProvenance: "agent",
          dependencies: [],
          artifacts: {
            qualityMapPath: ".quality/evidence/provenance-target/quality-map.yaml",
            specPath: "specs/001-provenance/spec.md",
            checklistPaths: []
          },
          codeRefs: [],
          evidenceRefs: [],
          openQuestions: [],
          residualRisks: []
        }
      ],
      productDocs: [],
      crossFeatureConcerns: [],
      discovery: {
        evidenceGaps: [],
        unresolvedDrift: []
      }
    }
  };
}

function provenanceScanResult(featureStatus: string = "verified") {
  const qualityMaps = provenanceQualityMaps();
  const projectMap = provenanceProjectMap(featureStatus);
  return projectIndexScanResult({
    projectMaps: {
      primary: projectMap,
      results: [projectMap],
      diagnostics: []
    },
    qualityMaps,
    markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
  });
}

// Gate 4: stamp the (already-normalized) graph reviewed, simulating an approved
// check list. Mirrors what `checks_reviewed: true` in the YAML produces.
function reviewedScanResult(featureStatus: string = "verified") {
  const base = provenanceScanResult(featureStatus);
  const results = base.qualityMaps.results.map((entry) =>
    entry.graph === undefined ? entry : { ...entry, graph: { ...entry.graph, checksReviewed: true } }
  );
  return { ...base, qualityMaps: { ...base.qualityMaps, results } };
}

describe("structure provenance and structure confidence", () => {
  it("resolves provenance from map default, per-expectation override, and explicit unspecified", () => {
    const graph = provenanceQualityMaps().results[0]?.graph;
    const byId = (localId: string) =>
      graph?.expectations.find((expectation) => expectation.localId === localId);

    expect(byId("exp-spec")?.structureProvenance).toBe("spec");
    expect(byId("exp-brownfield")?.structureProvenance).toBe("inferred_brownfield");
    expect(byId("exp-unspecified")?.structureProvenance).toBe("unspecified");
  });

  it("derives structure confidence labels per quality check in the owner view", () => {
    const result = provenanceScanResult();
    const targetId = provenanceQualityMaps().results[0]?.graph?.target.normalizedId ?? "";
    const owner = buildOwnerView({ result, targetId });
    const byTitle = (title: string) =>
      owner.expectations.find((expectation) => expectation.title === title);

    expect(byTitle("Spec-authored check")?.structureConfidence).toBe("HIGH");
    expect(byTitle("Brownfield check")?.structureConfidence).toBe("LOW");
    expect(byTitle("Unspecified check")?.structureConfidence).toBe("UNSPECIFIED");
    // The two axes are independent: strong direct evidence keeps evidence
    // confidence HIGH even where structure confidence is LOW.
    expect(byTitle("Brownfield check")?.evidenceConfidence).toBe("HIGH");
  });

  it("scores structure confidence separately, counting an unspecified check as zero", () => {
    const workspace = buildWorkspace({ result: provenanceScanResult() });
    const projectEvidence = workspace.projectSummary?.freshness.projectEvidence;

    // Evidence confidence: all three checks have strong direct evidence -> 100.
    expect(projectEvidence?.evidenceConfidenceScore).toBe("100");
    // Structure confidence is the human anchor: spec (1.0, w3) + inferred_brownfield
    // (0.4, w3) + unspecified (0, w3, COUNTED not excluded), so
    // (3 + 1.2 + 0) / 9 = 0.467 -> 47 -> LOW.
    expect(projectEvidence?.structureConfidenceScore).toBe("47");
    expect(projectEvidence?.structureConfidence).toBe("LOW");
  });

  it("scores by origin until both human gates clear — confirming the feature alone does not lift it", () => {
    // Unreviewed, the score is origin-based (47) whether or not the feature is
    // confirmed. Gate 2 (confirm) is necessary but not sufficient; gate 4 (review)
    // is what lifts trust, and neither overwrites a check's origin.
    const score = (status: string) =>
      buildWorkspace({ result: provenanceScanResult(status) }).projectSummary?.freshness.projectEvidence
        ?.structureConfidenceScore;
    expect(score("verified")).toBe("47");
    expect(score("candidate")).toBe("47");
  });

  it("lifts every check to HIGH once reviewed AND confirmed (gate 2 + gate 4)", () => {
    // Review (checks_reviewed) makes each check count as HIGH (1.0) regardless of
    // origin: (1 + 1 + 1) / 3 = 1.0 -> 100. Gate 2 must also be clear: a reviewed
    // check list under a still-candidate feature stays at the origin score.
    const evidenceFor = (status: string) =>
      buildWorkspace({ result: reviewedScanResult(status) }).projectSummary?.freshness.projectEvidence;

    expect(evidenceFor("verified")?.structureConfidenceScore).toBe("100");
    expect(evidenceFor("verified")?.structureConfidence).toBe("HIGH");
    // Gate 2 still gates: reviewed but unconfirmed -> back to the origin score.
    expect(evidenceFor("candidate")?.structureConfidenceScore).toBe("47");
  });

  it("parses the checks_reviewed flag strictly (only literal true counts)", () => {
    const parseReviewed = (value: unknown): boolean => {
      const parsed: ParsedQualityMap = {
        source: {
          projectRelativePath: ".quality/evidence/provenance-target/quality-map.yaml",
          resolvedLocalPath: "inline/quality-map.yaml",
          targetCandidateId: ".quality/evidence/provenance-target",
          sourcePattern: "test"
        },
        status: "parsed",
        rawText: "",
        rawDocument: {
          target: { id: "001-provenance", name: "Provenance Feature", scope: "feature" },
          // A truthy-but-non-boolean value must NOT silently lift checks to HIGH.
          ...(value === undefined ? {} : { checks_reviewed: value }),
          expectations: [{ id: "u1", title: "Unspecified one", source_type: "SOURCE", priority: "P1" }]
        },
        diagnostics: []
      };
      return normalizeQualityMap(validateQualityMap(parsed)).graph?.checksReviewed ?? false;
    };

    expect(parseReviewed(true)).toBe(true);
    expect(parseReviewed(undefined)).toBe(false);
    expect(parseReviewed(false)).toBe(false);
    expect(parseReviewed("true")).toBe(false);
    expect(parseReviewed(1)).toBe(false);
  });

  it("lifts owner-view per-check structure confidence to HIGH only when reviewed AND confirmed", () => {
    const targetId = provenanceQualityMaps().results[0]?.graph?.target.normalizedId ?? "";
    const labelsFor = (result: ReturnType<typeof provenanceScanResult>) => {
      const owner = buildOwnerView({ result, targetId });
      return owner.expectations.map((expectation) => expectation.structureConfidence);
    };

    // Reviewed + confirmed: every check reads HIGH regardless of its origin.
    expect(labelsFor(reviewedScanResult("verified"))).toEqual(["HIGH", "HIGH", "HIGH"]);
    // Reviewed but the feature is still a candidate (gate 2 fails) -> origin labels.
    expect(labelsFor(reviewedScanResult("candidate"))).toEqual(["HIGH", "LOW", "UNSPECIFIED"]);
  });

  it("lifts the project-index feature row label to HIGH only when reviewed AND confirmed", () => {
    const rowLabel = (result: ReturnType<typeof provenanceScanResult>) =>
      buildProjectIndex({ result }).targets.find((target) => target.featureKey === "001-provenance")
        ?.structureConfidence;

    // Unreviewed: worst origin label across spec/brownfield/unspecified is UNSPECIFIED.
    expect(rowLabel(provenanceScanResult("verified"))).toBe("UNSPECIFIED");
    // Reviewed + confirmed lifts the whole feature row to HIGH.
    expect(rowLabel(reviewedScanResult("verified"))).toBe("HIGH");
    // Reviewed but unconfirmed stays at the origin label.
    expect(rowLabel(reviewedScanResult("candidate"))).toBe("UNSPECIFIED");
  });

  it("rolls up to 0 / UNSPECIFIED when every check is unspecified", () => {
    const parsed: ParsedQualityMap = {
      source: {
        projectRelativePath: ".quality/evidence/provenance-target/quality-map.yaml",
        resolvedLocalPath: "inline/quality-map.yaml",
        targetCandidateId: ".quality/evidence/provenance-target",
        sourcePattern: "test"
      },
      status: "parsed",
      rawText: "",
      rawDocument: {
        target: { id: "001-provenance", name: "Provenance Feature", scope: "feature" },
        expectations: [
          { id: "u1", title: "Unspecified one", source_type: "SOURCE", category: "workflow", priority: "P1" },
          { id: "u2", title: "Unspecified two", source_type: "SOURCE", category: "workflow", priority: "P0" }
        ]
      },
      diagnostics: []
    };
    const normalized = normalizeQualityMap(validateQualityMap(parsed));
    const qualityMaps = { results: [normalized], diagnostics: [] };
    const projectMap = provenanceProjectMap();
    const result = projectIndexScanResult({
      projectMaps: { primary: projectMap, results: [projectMap], diagnostics: [] },
      qualityMaps,
      markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
    });
    const projectEvidence = buildWorkspace({ result }).projectSummary?.freshness.projectEvidence;

    // Every check is unspecified -> 0 numerator over a non-zero denominator -> 0,
    // and the label is UNSPECIFIED (not LOW), matching the per-check labels.
    expect(projectEvidence?.structureConfidenceScore).toBe("0");
    expect(projectEvidence?.structureConfidence).toBe("UNSPECIFIED");
  });

  it("flags out-of-vocabulary provenance with a warning and falls back to unspecified", () => {
    const parsed: ParsedQualityMap = {
      source: {
        projectRelativePath: "inline/quality-map.yaml",
        resolvedLocalPath: "inline/quality-map.yaml",
        targetCandidateId: "inline",
        sourcePattern: "test"
      },
      status: "parsed",
      rawText: "",
      rawDocument: {
        structure_provenance: "made-up",
        target: { id: "inline-target", name: "Inline", scope: "feature" },
        expectations: [
          {
            id: "exp-inline",
            title: "Inline check",
            source_type: "SOURCE",
            category: "workflow",
            priority: "P1"
          }
        ]
      },
      diagnostics: []
    };

    const validation = validateQualityMap(parsed);
    expect(validation.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "INVALID_STRUCTURE_PROVENANCE",
        yamlPath: "$.structure_provenance"
      })
    );

    const normalized = normalizeQualityMap(validation);
    expect(normalized.graph?.expectations[0]?.structureProvenance).toBe("unspecified");
  });

  it("forces an invalid per-expectation provenance to unspecified instead of inheriting the map default", () => {
    const parsed: ParsedQualityMap = {
      source: {
        projectRelativePath: "inline/quality-map.yaml",
        resolvedLocalPath: "inline/quality-map.yaml",
        targetCandidateId: "inline",
        sourcePattern: "test"
      },
      status: "parsed",
      rawText: "",
      rawDocument: {
        structure_provenance: "spec",
        target: { id: "inline-target", name: "Inline", scope: "feature" },
        expectations: [
          {
            id: "exp-invalid",
            title: "Invalid override",
            source_type: "SOURCE",
            structure_provenance: "made-up",
            category: "workflow",
            priority: "P1"
          },
          {
            id: "exp-absent",
            title: "Absent inherits map default",
            source_type: "SOURCE",
            category: "workflow",
            priority: "P1"
          }
        ]
      },
      diagnostics: []
    };

    const validation = validateQualityMap(parsed);
    expect(validation.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "INVALID_STRUCTURE_PROVENANCE",
        yamlPath: "$.expectations[0].structure_provenance"
      })
    );

    const normalized = normalizeQualityMap(validation);
    const byId = (localId: string) =>
      normalized.graph?.expectations.find((expectation) => expectation.localId === localId);
    // Invalid value must NOT inherit the map's "spec" default.
    expect(byId("exp-invalid")?.structureProvenance).toBe("unspecified");
    // Absent value still inherits the map default.
    expect(byId("exp-absent")?.structureProvenance).toBe("spec");
  });

  it("treats an empty/whitespace structure_provenance as absent without warning", () => {
    const parsed: ParsedQualityMap = {
      source: {
        projectRelativePath: "inline/quality-map.yaml",
        resolvedLocalPath: "inline/quality-map.yaml",
        targetCandidateId: "inline",
        sourcePattern: "test"
      },
      status: "parsed",
      rawText: "",
      rawDocument: {
        structure_provenance: null,
        target: { id: "inline-target", name: "Inline", scope: "feature" },
        expectations: [
          {
            id: "exp-padded",
            title: "Padded value is trimmed",
            source_type: "SOURCE",
            structure_provenance: "  Inferred_Brownfield  ",
            category: "workflow",
            priority: "P1"
          }
        ]
      },
      diagnostics: []
    };

    const validation = validateQualityMap(parsed);
    // A null/empty map-level value is absent, not invalid: no warning.
    expect(
      validation.diagnostics.some((diagnostic) => diagnostic.code === "INVALID_STRUCTURE_PROVENANCE")
    ).toBe(false);

    const normalized = normalizeQualityMap(validation);
    // Whitespace and casing are normalized before matching the vocabulary.
    expect(normalized.graph?.expectations[0]?.structureProvenance).toBe("inferred_brownfield");
  });
});
