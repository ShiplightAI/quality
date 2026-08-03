import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySavedQcView,
  buildMarkdownFallbackBatch,
  buildOwnerView,
  buildProjectIndex,
  scanProject
} from "@shiplightai/quality-core";
import { parseQualityMaps } from "@shiplightai/quality-map";
import { projectIndexScanResult } from "../fixtures/project-index/build-fixtures";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { snapshotProjectFiles } from "../fixtures/quality-projects/file-snapshot";

describe("project index integration", () => {
  it("builds an index from scanned structured and Markdown fallback targets", async () => {
    const fixture = await createFixtureProject("project-index", [
      {
        relativePath: ".quality/evidence/project/quality-map.yaml",
        contents:
          'target:\n  id: "project"\n  name: "Project Quality"\n  scope: "project"\nexpectations:\n  - id: "project-expectation"\n    title: "Project expectation"\n    source_type: "SOURCE"\n    category: "baseline"\n    priority: "P1"\n    risk:\n      weight: 2\n      rationale: "Project fixture should stay structurally valid."\n'
      },
      {
        relativePath: "specs/markdown/test-spec.md",
        contents: "# Test Spec: Markdown Target\n\n## Testing What\n\nFallback target.\n"
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const index = buildProjectIndex({ result });

      expect(index.state).toBe("partialDiagnostics");
      expect(index.targets.map((target) => target.displayName)).toEqual([
        "Project Quality",
        "Markdown Target"
      ]);
      expect(index.targets[0]?.scope).toBe("project");
      expect(index.targets[1]?.sourceClassification).toBe("parsed_markdown_fallback");
    } finally {
      await fixture.cleanup();
    }
  });

  it("uses a project map as the project and feature entry point when available", async () => {
    const fixture = await createFixtureProject("project-map-index", [
      {
        relativePath: ".quality/project-map.yaml",
        contents:
          'project:\n  id: "mapped-project"\n  name: "Mapped Project"\n  source_refs:\n    - path: "README.md"\n      label: "Readme"\nroadmap:\n  feature_order:\n    - "001-feature-one"\nactive_feature:\n  id: "001-feature-one"\n  phase: "verified"\nfeatures:\n  - id: "001-feature-one"\n    name: "Feature One"\n    status: "verified"\n    artifacts:\n      spec_path: "specs/001-feature-one/spec.md"\n      quality_map_path: ".quality/evidence/feature-one/quality-map.yaml"\n      test_report_path: "specs/feature-one/test-report.md"\n    evidence_refs:\n      - "tests/contract/feature-one.test.ts"\n'
      },
      {
        relativePath: "README.md",
        contents: "# Mapped Project\n"
      },
      {
        relativePath: "specs/001-feature-one/spec.md",
        contents: "# Feature One Spec\n"
      },
      {
        relativePath: ".quality/evidence/feature-one/quality-map.yaml",
        contents:
          'target:\n  id: "feature-one"\n  name: "Quality Map Name"\n  scope: "feature"\n  source_refs:\n    - path: "specs/001-feature-one/spec.md"\n      label: "spec.md"\n    - path: ".quality/evidence/feature-one/quality-map.yaml"\n      label: "quality-map.yaml"\n    - path: "specs/feature-one/test-report.md"\n      label: "test-report.md"\nexpectations:\n  - id: "mapped-expectation"\n    title: "Mapped expectation"\n    source_type: "SOURCE"\n    category: "workflow"\n    priority: "P1"\n    risk:\n      weight: 2\n      rationale: "Feature fixture should stay structurally valid."\n'
      },
      {
        relativePath: "specs/feature-one/test-report.md",
        contents: "# Feature One Report\n"
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const index = buildProjectIndex({ result });
      const feature = index.targets.find((target) => target.displayName === "Feature One");

      expect(index.targets.map((target) => target.displayName)).toEqual([
        "Mapped Project",
        "Feature One"
      ]);
      expect(index.targets.every((target) => target.sourceClassification === "project_map")).toBe(true);
      expect(feature?.targetId).toContain(".quality/evidence/feature-one/quality-map.yaml#target:feature-one");
      const featureSourcePaths = feature!.sourceReferences.map((reference) => reference.path);
      expect(featureSourcePaths).toEqual(
        expect.arrayContaining([
          ".quality/project-map.yaml",
          "specs/001-feature-one/spec.md",
          ".quality/evidence/feature-one/quality-map.yaml",
          "specs/feature-one/test-report.md"
        ])
      );
      expect(featureSourcePaths).toEqual([...new Set(featureSourcePaths)]);
      expect(buildOwnerView({ result, targetId: feature!.targetId }).expectations).toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("filters project-map targets to the selected saved QC view", async () => {
    const fixture = await createFixtureProject("project-map-saved-view", [
      {
        relativePath: ".quality/project-map.yaml",
        contents:
          'project:\n  id: "mapped-project"\n  name: "Mapped Project"\nroadmap:\n  feature_order:\n    - "001-feature-one"\n    - "002-feature-two"\nfeatures:\n  - id: "001-feature-one"\n    name: "Feature One"\n    status: "verified"\n    artifacts:\n      quality_map_path: ".quality/evidence/feature-one/quality-map.yaml"\n  - id: "002-feature-two"\n    name: "Feature Two"\n    status: "verified"\n    artifacts:\n      quality_map_path: ".quality/evidence/feature-two/quality-map.yaml"\n'
      },
      {
        relativePath: ".quality/config/views.yaml",
        contents:
          'views:\n  - id: "cli"\n    name: "CLI"\n    description: "Feature One only."\n    feature_ids:\n      - "001-feature-one"\n'
      },
      {
        relativePath: ".quality/evidence/feature-one/quality-map.yaml",
        contents:
          'target:\n  id: "feature-one"\n  name: "Feature One"\n  scope: "feature"\nexpectations:\n  - id: "feature-one-expectation"\n    title: "Feature One expectation"\n    source_type: "SOURCE"\n    category: "workflow"\n    priority: "P1"\n    risk:\n      weight: 2\n      rationale: "Feature one stays valid."\n'
      },
      {
        relativePath: ".quality/evidence/feature-two/quality-map.yaml",
        contents:
          'target:\n  id: "feature-two"\n  name: "Feature Two"\n  scope: "feature"\nexpectations:\n  - id: "feature-two-expectation"\n    title: "Feature Two expectation"\n    source_type: "SOURCE"\n    category: "workflow"\n    priority: "P1"\n    risk:\n      weight: 2\n      rationale: "Feature two stays valid."\n'
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const filtered = applySavedQcView(result, "cli");
      const index = buildProjectIndex({ result: filtered });

      expect(index.targets.map((target) => target.displayName)).toEqual([
        "Mapped Project",
        "Feature One"
      ]);
      expect(filtered?.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual([
        ".quality/config/views.yaml",
        ".quality/evidence/feature-one/quality-map.yaml",
        ".quality/project-map.yaml"
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("ignores unsupported test-quality artifacts when building project-map feature entries", async () => {
    const fixture = await createFixtureProject("project-map-ignores-test-quality", [
      {
        relativePath: ".quality/project-map.yaml",
        contents:
          'project:\n  id: "mapped-project"\n  name: "Mapped Project"\nroadmap:\n  feature_order:\n    - "001-feature-one"\n    - "002-feature-two"\n    - "003-feature-three"\nfeatures:\n  - id: "001-feature-one"\n    name: "Feature One"\n    status: "verified"\n    artifacts:\n      spec_path: "specs/001-feature-one/spec.md"\n  - id: "002-feature-two"\n    name: "Feature Two"\n    status: "verified"\n    artifacts:\n      spec_path: "specs/002-feature-two/spec.md"\n  - id: "003-feature-three"\n    name: "Feature Three"\n    status: "verified"\n    artifacts:\n      spec_path: "specs/003-feature-three/spec.md"\n'
      },
      {
        relativePath: "specs/001-feature-one/spec.md",
        contents: "# Feature One Spec\n"
      },
      {
        relativePath: "specs/002-feature-two/spec.md",
        contents: "# Feature Two Spec\n"
      },
      {
        relativePath: "specs/003-feature-three/spec.md",
        contents: "# Feature Three Spec\n"
      },
      {
        relativePath: "test-quality/scaffold-existing-repo-merge/test-report.md",
        contents:
          "# Test Report: `scaffold_project` non-empty-directory support\n\n## Summary\n\nLegacy report that should not become a standalone feature when a project map is present.\n"
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const index = buildProjectIndex({ result });

      expect(result.artifacts.some((artifact) => artifact.projectRelativePath.startsWith("test-quality/"))).toBe(false);
      expect(index.targets.map((target) => target.displayName)).toEqual([
        "Mapped Project",
        "Feature One",
        "Feature Two",
        "Feature Three"
      ]);
      expect(index.targets.some((target) => target.displayName.includes("scaffold_project"))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps independent structured targets that share a project-map feature directory", () => {
    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: ".quality/evidence/shared/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/project-index/shared-primary-quality-map.yaml"),
        targetCandidateId: ".quality/evidence/shared",
        sourcePattern: "test"
      },
      {
        projectRelativePath: ".quality/evidence/shared/secondary-quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/project-index/shared-secondary-quality-map.yaml"),
        targetCandidateId: ".quality/evidence/shared-secondary",
        sourcePattern: "test"
      }
    ]);
    const projectMap = {
      source: {
        projectRelativePath: ".quality/project-map.yaml",
        resolvedLocalPath: "/fixture/.quality/project-map.yaml"
      },
      status: "parsed" as const,
      rawText: "",
      diagnostics: [],
      map: {
        project: {
          id: "mapped-project",
          name: "Mapped Project",
          sourceRefs: []
        },
        featureOrder: ["001-primary"],
        features: [
          {
            id: "001-primary",
            name: "Primary Feature",
            status: "candidate",
            priorityProvenance: "agent",
            dependencies: [],
            artifacts: {
              qualityMapPath: ".quality/evidence/shared/quality-map.yaml",
              checklistPaths: []
            },
            codeRefs: [],
            evidenceRefs: [],
            openQuestions: [],
            residualRisks: []
          }
        ],
        productDocs: [],
        releaseAreas: [],
        crossFeatureConcerns: [],
        discovery: {
          evidenceGaps: [],
          unresolvedDrift: []
        }
      }
    };
    const result = projectIndexScanResult({
      projectMaps: {
        primary: projectMap,
        results: [projectMap],
        diagnostics: []
      },
      qualityMaps,
      markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
    });
    const index = buildProjectIndex({ result });

    expect(index.targets.map((target) => target.displayName)).toEqual([
      "Mapped Project",
      "Primary Feature",
      "Secondary Shared Map"
    ]);
  });

  it("renders empty and invalid states from scan outcomes", async () => {
    const empty = await scanProject({
      projectPath: path.resolve("tests/fixtures/quality-projects/empty"),
      mode: "scan"
    });
    const invalid = await scanProject({
      projectPath: path.resolve("tests/fixtures/quality-projects/missing"),
      mode: "scan"
    });

    expect(buildProjectIndex({ result: empty }).state).toBe("empty");
    expect(buildProjectIndex({ result: invalid }).state).toBe("invalidProject");
  });

  it("preserves valid targets when project, map, or Markdown diagnostics exist", async () => {
    const fixture = await createFixtureProject("project-index-diagnostics", [
      {
        relativePath: "specs/good/test-spec.md",
        contents: "# Test Spec: Good\n\n## Testing What\n\nGood fallback.\n"
      },
      {
        relativePath: ".quality/evidence/bad/quality-map.yaml",
        contents:
          'target:\n  id: "bad"\n  name: "Bad Map"\n  scope: "feature"\nexpectations:\n  id: "not-an-array"\n'
      },
      {
        relativePath: "specs/empty/test-spec.md",
        contents: "\n"
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const index = buildProjectIndex({ result });

      expect(index.state).toBe("partialDiagnostics");
      expect(index.targets.map((target) => target.displayName)).toEqual(["Good"]);
      expect(index.diagnostics.severityCounts.error).toBeGreaterThanOrEqual(1);
      expect(index.diagnostics.severityCounts.info).toBeGreaterThanOrEqual(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not mutate scanned files or call external upload APIs while building the index", async () => {
    const fixture = await createFixtureProject("project-index-read-only", [
      {
        relativePath: "specs/project/test-spec.md",
        contents: "# Test Spec: Read Only\n\n## Testing What\n\nNo mutation.\n"
      }
    ]);
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("External fetch is not allowed.");
    }) as typeof fetch;

    try {
      const before = await snapshotProjectFiles(fixture.root);
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      buildProjectIndex({ result });
      const after = await snapshotProjectFiles(fixture.root);

      expect(after).toEqual(before);
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.cleanup();
    }
  });
});
