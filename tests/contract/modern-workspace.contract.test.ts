import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySavedQcView,
  buildMarkdownFallbackBatch,
  buildGapTriage,
  buildWorkspace,
  buildProjectIndex,
  normalizeWorkspaceNavigation,
  selectWorkspaceDetail,
  selectWorkspaceSection,
  selectWorkspaceTarget,
  type DiscoveredArtifact,
  type TargetSummary
} from "@shiplightai/quality-core";
import { parseQualityMaps } from "@shiplightai/quality-map";
import { markdownArtifactSource } from "../fixtures/markdown-fallback/build-fixtures";
import { projectIndexScanResult } from "../fixtures/project-index/build-fixtures";

function workspaceResult() {
  const qualityMaps = parseQualityMaps([
    {
      projectRelativePath: ".quality/evidence/gap-target/quality-map.yaml",
      resolvedLocalPath: path.resolve("tests/fixtures/gap-triage/complete/quality-map.yaml"),
      targetCandidateId: ".quality/evidence/gap-target",
      sourcePattern: "test"
    }
  ]);
  const markdownFallback = buildMarkdownFallbackBatch({
    sources: [
      markdownArtifactSource("markdown-only/test-spec.md", "test_spec", "specs/markdown-only")
    ],
    qualityMaps
  });
  const artifacts: readonly DiscoveredArtifact[] = [
    {
      id: "gap-map",
      kind: "quality_map",
      projectRelativePath: ".quality/evidence/gap-target/quality-map.yaml",
      originalPath: "/fixture/.quality/evidence/gap-target/quality-map.yaml",
      resolvedPath: "/fixture/.quality/evidence/gap-target/quality-map.yaml",
      targetLocation: ".quality/evidence/gap-target",
      sourcePattern: "test"
    }
  ];

  return projectIndexScanResult({
    artifacts,
    qualityMaps,
    markdownFallback,
    diagnostics: [
      {
        severity: "warning",
        code: "FIXTURE_WARNING",
        message: "Fixture warning",
        affectedPath: ".quality/evidence/gap-target/quality-map.yaml"
      }
    ],
    status: "partial"
  });
}

function targetSummary(overrides: Partial<TargetSummary> & Pick<TargetSummary, "targetId" | "name">): TargetSummary {
  return {
    scope: "feature",
    sourceType: "project_map",
    status: "unknown",
    evidenceConfidence: "unknown",
    structureConfidence: "unknown",
    mapAvailability: "available",
    priorityCounts: {},
    gapCounts: {},
    evidenceCount: 0,
    expectationCount: 0,
    diagnosticCounts: { error: 0, warning: 0, info: 0 },
    releaseRiskCounts: { blockers: 0, accepted: 0, deferred: 0 },
    riskIndicators: [],
    sourceRefs: [],
    ...overrides
  };
}

describe("modern quality workspace", () => {
  it("builds an owner-first summary with structured and fallback target signals", () => {
    const workspace = buildWorkspace({ result: workspaceResult() });
    const diagnosticCounts = {
      error: workspace.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      warning: workspace.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
      info: workspace.diagnostics.filter((diagnostic) => diagnostic.severity === "info").length
    };

    expect(workspace.state).toBe("partialDiagnostics");
    expect(workspace.summary).toMatchObject({
      targetCount: 2,
      artifactCount: 1,
      overallStatus: "partial"
    });
    expect(workspace.summary.diagnosticCounts).toEqual(diagnosticCounts);
    expect(workspace.summary.sourceMix).toEqual({
      projectMap: 0,
      structuredQualityMap: 1,
      parsedMarkdownFallback: 1,
      supplementalMarkdownNarrative: 0
    });
    expect(workspace.summary.attentionCounts.atRisk).toBeGreaterThan(0);
    expect(workspace.targets.map((target) => target.name)).toContain("Gap Target");
    expect(workspace.targets.some((target) => target.sourceType === "parsed_markdown_fallback")).toBe(true);
  });

  it("builds a project summary, ignores release-area metadata, and downgrades project-map-only feature confidence", () => {
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
          summary: "Project-level summary for human review.",
          sourceRefs: []
        },
        activeFeature: {
          id: "001-feature-one",
          phase: "release",
          branch: "feature-branch",
          updatedAt: "2026-05-31"
        },
        featureOrder: ["001-feature-one"],
        features: [
          {
            id: "001-feature-one",
            name: "Feature One",
            description: "Feature summary for review-oriented navigation.",
            status: "verified",
            dependencies: [],
            artifacts: {
              specPath: "specs/001-feature-one/spec.md",
              checklistPaths: []
            },
            codeRefs: [],
            evidenceRefs: [],
            openQuestions: [],
            residualRisks: ["No slug-matched quality map exists."]
          }
        ],
        productDocs: [],
        crossFeatureConcerns: [],
        discovery: {
          evidenceGaps: ["Feature One lacks canonical evidence."],
          unresolvedDrift: []
        }
      }
    };
    const result = projectIndexScanResult({
      artifacts: [
        {
          id: "project-map",
          kind: "project_map",
          projectRelativePath: ".quality/project-map.yaml",
          originalPath: "/fixture/.quality/project-map.yaml",
          resolvedPath: "/fixture/.quality/project-map.yaml",
          targetLocation: ".quality",
          sourcePattern: ".quality/project-map.yaml"
        }
      ],
      projectMaps: {
        primary: projectMap,
        results: [projectMap],
        diagnostics: []
      },
      qualityMaps: parseQualityMaps([]),
      markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps: parseQualityMaps([]) })
    });
    const workspace = buildWorkspace({ result });
    const feature = workspace.targets.find((target) => target.name === "Feature One");

    expect(feature).toMatchObject({
      description: "Feature summary for review-oriented navigation.",
      evidenceConfidence: "No canonical evidence",
      mapAvailability: "project_map_only"
    });
    expect(workspace.projectSummary).toMatchObject({
      projectName: "Mapped Project"
    });
    // The project summary carries no planning concepts: no focus pointer beyond
    // the map's own `active_feature`, and no milestone or release grouping.
    expect(workspace.projectSummary).not.toHaveProperty("activeFeature");
    expect(workspace.projectSummary).not.toHaveProperty("releaseAreas");
    expect(workspace.projectSummary).not.toHaveProperty("currentMilestone");
    expect(workspace.projectSummary).not.toHaveProperty("currentMilestoneLabel");
    expect(workspace.projectSummary?.topRisks[0]).toMatchObject({
      targetName: "Feature One",
      reason: expect.stringContaining("No canonical quality-map.yaml"),
      section: "overview",
      detailKind: "target",
      detailId: "001-feature-one"
    });
    expect(workspace.projectSummary).toMatchObject({
      totalRiskCount: 1,
      totalNextProofCount: 0
    });
    expect(workspace.projectSummary?.freshness.driftWarnings).toContain("Feature One lacks canonical evidence.");
    expect(workspace.projectSummary?.freshness.projectEvidence).toMatchObject({
      status: "PARTIAL",
      totalCheckCount: 0,
      basis: "Derived from project structure only; no canonical quality-map.yaml files are attached yet."
    });
  });

  it("keeps standalone project-scope quality maps out of the project summary rollup", () => {
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
        featureOrder: ["001-feature-one"],
        features: [
          {
            id: "001-feature-one",
            name: "Feature One",
            dependencies: [],
            artifacts: {
              qualityMapPath: ".quality/evidence/feature-one/quality-map.yaml",
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
    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: ".quality/evidence/project/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/project-rollup-with-feature-refs.yaml"),
        targetCandidateId: "project",
        sourcePattern: "test"
      },
      {
        projectRelativePath: ".quality/evidence/feature-one/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/feature-one-quality-map.yaml"),
        targetCandidateId: "001-feature-one",
        sourcePattern: "test"
      }
    ]);
    const workspace = buildWorkspace({
      result: projectIndexScanResult({
        artifacts: [],
        projectMaps: {
          primary: projectMap,
          results: [projectMap],
          diagnostics: []
        },
        qualityMaps,
        markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
      })
    });

    const projectTarget = workspace.targets.find((target) => target.targetId === "project-map:mapped-project");
    const featureTarget = workspace.targets.find((target) => target.featureKey === "001-feature-one");

    expect(projectTarget?.gapCounts).toEqual({});
    expect(workspace.targets.some((target) => target.name === "Project Rollup")).toBe(false);
    expect(featureTarget?.gapCounts).toMatchObject({ deferred: 1 });
    expect(workspace.projectSummary?.topRisks.every((item) => item.targetName === "Feature One")).toBe(true);
    expect(workspace.projectSummary?.totalRiskCount).toBe(2);
  });

  it("keeps freshness summaries structural-only when no observations are ingested", () => {
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
        featureOrder: [],
        features: [],
        productDocs: [],
        crossFeatureConcerns: [],
        discovery: {
          evidenceGaps: [],
          unresolvedDrift: []
        }
      }
    };
    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: ".quality/evidence/project/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/invalid-rollup-timestamp-quality-map.yaml"),
        targetCandidateId: ".quality/evidence/project",
        sourcePattern: "test"
      }
    ]);
    const result = projectIndexScanResult({
      projectMaps: {
        primary: projectMap,
        results: [projectMap],
        diagnostics: []
      },
      qualityMaps,
      markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
    });
    const workspace = buildWorkspace({ result });

    expect(workspace.projectSummary?.freshness.latestEvidenceAt).toBeUndefined();
    expect(workspace.projectSummary?.freshness.latestEvidenceCommit).toBeUndefined();
    expect(workspace.projectSummary?.freshness.driftWarnings).toEqual([]);
  });

  it("derives project readiness summary from feature quality maps when no project rollup map exists", () => {
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
          summary: "Derived project summary.",
          sourceRefs: []
        },
        featureOrder: ["001-feature-one", "002-feature-two"],
        features: [
          {
            id: "001-feature-one",
            name: "Feature One",
            status: "verified",
            priority: "P1",
            dependencies: [],
            artifacts: {
              qualityMapPath: ".quality/evidence/feature-one/quality-map.yaml",
              specPath: "specs/001-feature-one/spec.md",
              checklistPaths: []
            },
            codeRefs: [],
            evidenceRefs: [],
            openQuestions: [],
            residualRisks: []
          },
          {
            id: "002-feature-two",
            name: "Feature Two",
            status: "verified",
            priority: "P1",
            dependencies: [],
            artifacts: {
              qualityMapPath: ".quality/evidence/feature-two/quality-map.yaml",
              specPath: "specs/002-feature-two/spec.md",
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

    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: ".quality/evidence/feature-one/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/feature-one-quality-map.yaml"),
        targetCandidateId: "001-feature-one",
        sourcePattern: "test"
      },
      {
        projectRelativePath: ".quality/evidence/feature-two/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/feature-two-deferred-quality-map.yaml"),
        targetCandidateId: "002-feature-two",
        sourcePattern: "test"
      }
    ]);

    const workspace = buildWorkspace({
      result: projectIndexScanResult({
        projectMaps: {
          primary: projectMap,
          results: [projectMap],
          diagnostics: []
        },
        qualityMaps,
        markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
      })
    });

    // Scores recomputed under the type-derived model (depth/reliability removed).
    // Feature one (P1, weight 3): single "static" evidence -> not automated ->
    //   status IMPLICIT, evidenceConfidence LOW (quality 0.45, coverage 0.5, conf 0.35).
    // Feature two (P1, weight 3): single "manual" evidence -> manual-only ->
    //   status MANUAL, evidenceConfidence LOW (quality 0.55, coverage 0.4, conf 0.35).
    // qualityScore  = round((3*0.45 + 3*0.55)/6 * 100) = 50
    // coverageScore = round((3*0.5  + 3*0.4 )/6 * 100) = 45
    // evidenceConfidenceScore = round((3*0.35 + 3*0.35)/6 * 100) = 35 -> label LOW
    expect(workspace.projectSummary?.freshness.projectEvidence).toMatchObject({
      status: "PARTIAL",
      evidenceConfidence: "LOW",
      qualityScore: "50",
      coverageScore: "45",
      evidenceConfidenceScore: "35",
      totalCheckCount: 2,
      basis: "Derived from project structure and 2 feature quality maps."
    });
  });

  it("filters the workspace to the selected saved QC view", () => {
    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: ".quality/evidence/feature-one/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/feature-one-next-proof.yaml"),
        targetCandidateId: ".quality/evidence/feature-one",
        sourcePattern: "test"
      },
      {
        projectRelativePath: ".quality/evidence/feature-two/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/feature-two-next-proof.yaml"),
        targetCandidateId: ".quality/evidence/feature-two",
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
        featureOrder: ["001-feature-one", "002-feature-two"],
        features: [
          {
            id: "001-feature-one",
            name: "Feature One",
            dependencies: [],
            artifacts: {
              qualityMapPath: ".quality/evidence/feature-one/quality-map.yaml",
              checklistPaths: []
            },
            codeRefs: [],
            evidenceRefs: [],
            openQuestions: [],
            residualRisks: []
          },
          {
            id: "002-feature-two",
            name: "Feature Two",
            dependencies: [],
            artifacts: {
              qualityMapPath: ".quality/evidence/feature-two/quality-map.yaml",
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
    const savedViews = {
      results: [
        {
          source: {
            projectRelativePath: ".quality/config/views.yaml",
            resolvedLocalPath: "/fixture/.quality/config/views.yaml",
            sourcePattern: ".quality/config/views.yaml"
          },
          status: "parsed" as const,
          rawText: "",
          document: {
            views: [
              {
                id: "cli",
                name: "CLI",
                description: "Feature One only",
                featureIds: ["001-feature-one"]
              }
            ]
          },
          diagnostics: []
        }
      ],
      primary: {
        source: {
          projectRelativePath: ".quality/config/views.yaml",
          resolvedLocalPath: "/fixture/.quality/config/views.yaml",
          sourcePattern: ".quality/config/views.yaml"
        },
        status: "parsed" as const,
        rawText: "",
        document: {
          views: [
            {
              id: "cli",
              name: "CLI",
              description: "Feature One only",
              featureIds: ["001-feature-one"]
            }
          ]
        },
        diagnostics: []
      },
      diagnostics: []
    };
    const result = projectIndexScanResult({
      artifacts: [
        {
          id: "project-map",
          kind: "project_map",
          projectRelativePath: ".quality/project-map.yaml",
          originalPath: "/fixture/.quality/project-map.yaml",
          resolvedPath: "/fixture/.quality/project-map.yaml",
          targetLocation: ".quality",
          sourcePattern: ".quality/project-map.yaml"
        },
        {
          id: "views",
          kind: "views",
          projectRelativePath: ".quality/config/views.yaml",
          originalPath: "/fixture/.quality/config/views.yaml",
          resolvedPath: "/fixture/.quality/config/views.yaml",
          targetLocation: ".quality",
          sourcePattern: ".quality/config/views.yaml"
        },
        {
          id: "feature-one-map",
          kind: "quality_map",
          projectRelativePath: ".quality/evidence/feature-one/quality-map.yaml",
          originalPath: "/fixture/.quality/evidence/feature-one/quality-map.yaml",
          resolvedPath: "/fixture/.quality/evidence/feature-one/quality-map.yaml",
          targetLocation: ".quality/evidence/feature-one",
          sourcePattern: ".quality/evidence/*/quality-map.yaml"
        },
        {
          id: "feature-two-map",
          kind: "quality_map",
          projectRelativePath: ".quality/evidence/feature-two/quality-map.yaml",
          originalPath: "/fixture/.quality/evidence/feature-two/quality-map.yaml",
          resolvedPath: "/fixture/.quality/evidence/feature-two/quality-map.yaml",
          targetLocation: ".quality/evidence/feature-two",
          sourcePattern: ".quality/evidence/*/quality-map.yaml"
        }
      ],
      projectMaps: {
        primary: projectMap,
        results: [projectMap],
        diagnostics: []
      },
      views: savedViews,
      qualityMaps,
      markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
    });

    const filtered = applySavedQcView(result, "cli");
    const workspace = buildWorkspace({ result: filtered });

    expect(filtered?.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual([
      ".quality/project-map.yaml",
      ".quality/config/views.yaml",
      ".quality/evidence/feature-one/quality-map.yaml"
    ]);
    expect(workspace.targets.map((target) => target.name)).toEqual([
      "Mapped Project",
      "Feature One"
    ]);
    expect(workspace.projectSummary?.nextProofs.map((item) => item.targetName)).toEqual([
      "Feature One"
    ]);
  });

  it("keeps selected target context while switching workspace sections", () => {
    const initial = buildWorkspace({ result: workspaceResult() });
    const targetId = initial.targets[0]!.targetId;
    const selected = selectWorkspaceTarget(targetId);
    const evidence = selectWorkspaceSection("evidence", selected);
    const workspace = buildWorkspace({
      result: workspaceResult(),
      navigation: evidence
    });

    expect(workspace.selectedTarget?.targetId).toBe(targetId);
    expect(workspace.navigation.selectedSection).toBe("evidence");
    expect(workspace.sections.map((section) => section.sectionId)).toEqual([
      "overview",
      "evidence",
      "gaps",
      "analytics",
      "artifacts"
    ]);
    expect(workspace.sections.find((section) => section.sectionId === "gaps")?.badgeCount).toBeGreaterThan(0);
  });

  it("restores bookmarkable project-map feature slugs to canonical evidence targets", () => {
    const navigation = normalizeWorkspaceNavigation({
      navigation: {
        selectedTargetId: "030-agent-monitoring-runtime",
        selectedSection: "analytics"
      },
      targets: [
        {
          targetId: ".quality/evidence/project/quality-map.yaml#target:project",
          name: "Project",
          scope: "project",
          sourceType: "project_map",
          status: "partial",
          evidenceConfidence: "MEDIUM",
          mapAvailability: "available",
          priorityCounts: {},
          gapCounts: {},
          evidenceCount: 0,
          expectationCount: 0,
          diagnosticCounts: { error: 0, warning: 0, info: 0 },
          releaseRiskCounts: { blockers: 0, accepted: 0, deferred: 0 },
          riskIndicators: [],
          sourceRefs: [
            { label: "Project map", path: ".quality/project-map.yaml" },
            { label: "Feature spec", path: "specs/030-agent-monitoring-runtime/spec.md" }
          ]
        },
        {
          targetId: ".quality/evidence/030-agent-monitoring-runtime/quality-map.yaml#target:030-agent-monitoring-runtime",
          featureKey: "030-agent-monitoring-runtime",
          name: "Agent Monitoring Runtime",
          scope: "feature",
          sourceType: "project_map",
          status: "verified",
          evidenceConfidence: "HIGH",
          mapAvailability: "available",
          priorityCounts: {},
          gapCounts: {},
          evidenceCount: 0,
          expectationCount: 0,
          diagnosticCounts: { error: 0, warning: 0, info: 0 },
          releaseRiskCounts: { blockers: 0, accepted: 0, deferred: 0 },
          riskIndicators: [],
          sourceRefs: [
            { label: "Feature spec", path: "specs/030-agent-monitoring-runtime/spec.md" }
          ]
        }
      ]
    });

    expect(navigation).toMatchObject({
      selectedTargetId: ".quality/evidence/030-agent-monitoring-runtime/quality-map.yaml#target:030-agent-monitoring-runtime",
      selectedSection: "analytics"
    });
  });

  it("does not restore stale feature ids from incidental source path segments", () => {
    const navigation = normalizeWorkspaceNavigation({
      navigation: {
        selectedTargetId: "auth",
        selectedSection: "gaps"
      },
      targets: [
        targetSummary({
          targetId: ".quality/evidence/auth-v2/quality-map.yaml#target:auth-v2",
          featureKey: "auth-v2",
          name: "Auth v2",
          sourceRefs: [
            { label: "Feature spec", path: "specs/auth/spec.md" }
          ]
        })
      ]
    });

    expect(navigation).toMatchObject({
      selectedSection: "overview",
      targetRemovedMessage: "The previously selected feature is no longer present after refresh."
    });
    expect(navigation.selectedTargetId).toBeUndefined();
  });

  it("prefers exact target ids over colliding feature keys when restoring navigation", () => {
    const navigation = normalizeWorkspaceNavigation({
      navigation: {
        selectedTargetId: "009",
        selectedSection: "analytics"
      },
      targets: [
        targetSummary({
          targetId: "009",
          name: "Markdown fallback 009",
          sourceType: "parsed_markdown_fallback"
        }),
        targetSummary({
          targetId: ".quality/evidence/009-modern-quality-workspace/quality-map.yaml#target:modern-quality-workspace",
          featureKey: "009",
          name: "Modern Quality Workspace"
        })
      ]
    });

    expect(navigation).toMatchObject({
      selectedTargetId: "009",
      selectedSection: "analytics"
    });
  });

  it("keeps identical recommended action requests separate across features", () => {
    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: ".quality/evidence/feature-one/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/feature-one-next-proof.yaml"),
        targetCandidateId: ".quality/evidence/feature-one",
        sourcePattern: "test"
      },
      {
        projectRelativePath: ".quality/evidence/feature-two/quality-map.yaml",
        resolvedLocalPath: path.resolve("tests/fixtures/modern-workspace/feature-two-next-proof.yaml"),
        targetCandidateId: ".quality/evidence/feature-two",
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
        featureOrder: ["001-feature-one", "002-feature-two"],
        features: [
          {
            id: "001-feature-one",
            name: "Feature One",
            dependencies: [],
            artifacts: {
              qualityMapPath: ".quality/evidence/feature-one/quality-map.yaml",
              checklistPaths: []
            },
            codeRefs: [],
            evidenceRefs: [],
            openQuestions: [],
            residualRisks: []
          },
          {
            id: "002-feature-two",
            name: "Feature Two",
            dependencies: [],
            artifacts: {
              qualityMapPath: ".quality/evidence/feature-two/quality-map.yaml",
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
    const workspace = buildWorkspace({
      result: projectIndexScanResult({
        artifacts: [
          {
            id: "project-map",
            kind: "project_map",
            projectRelativePath: ".quality/project-map.yaml",
            originalPath: "/fixture/.quality/project-map.yaml",
            resolvedPath: "/fixture/.quality/project-map.yaml",
            targetLocation: ".quality",
            sourcePattern: ".quality/project-map.yaml"
          }
        ],
        projectMaps: {
          primary: projectMap,
          results: [projectMap],
          diagnostics: []
        },
        qualityMaps,
        markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
      })
    });

    expect(workspace.projectSummary?.totalNextProofCount).toBe(2);
    expect(workspace.projectSummary?.nextProofs.map((item) => item.targetName)).toEqual([
      "Feature One",
      "Feature Two"
    ]);
  });

  it("recovers when a selected target disappears after refresh", () => {
    const previous = buildWorkspace({ result: workspaceResult() });
    const nextIndex = buildProjectIndex({
      result: projectIndexScanResult({
        qualityMaps: parseQualityMaps([]),
        markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps: parseQualityMaps([]) })
      })
    });
    const refreshed = buildWorkspace({
      result: nextIndex.result,
      navigation: selectWorkspaceTarget(previous.targets[0]!.targetId)
    });

    expect(refreshed.selectedTarget).toBeUndefined();
    expect(refreshed.navigation.targetRemovedMessage).toContain("no longer present");
  });

  it("opens diagnostic, gap, and artifact details as read-only trace records", () => {
    const base = buildWorkspace({
      result: workspaceResult(),
      navigation: selectWorkspaceTarget(buildWorkspace({ result: workspaceResult() }).targets[0]!.targetId)
    });
    const diagnostic = base.diagnostics[0]!;
    const gapRecords = buildGapTriage({
      result: workspaceResult(),
      targetId: base.selectedTarget!.targetId
    }).records;
    const gap = gapRecords[0]!;
    const docOnlyGap = gapRecords.find((record) =>
      record.evidence.some((evidence) => evidence.path === "docs/deferred-check.md")
    )!;
    const diagnosticWorkspace = buildWorkspace({
      result: workspaceResult(),
      navigation: selectWorkspaceDetail(base.navigation, {
        selectedDetailKind: "diagnostic",
        selectedDetailId: diagnostic.id
      })
    });
    const gapWorkspace = buildWorkspace({
      result: workspaceResult(),
      navigation: selectWorkspaceDetail(base.navigation, {
        selectedDetailKind: "gap",
        selectedDetailId: gap.gapId
      })
    });
    const docOnlyGapWorkspace = buildWorkspace({
      result: workspaceResult(),
      navigation: selectWorkspaceDetail(base.navigation, {
        selectedDetailKind: "gap",
        selectedDetailId: docOnlyGap.gapId
      })
    });
    const artifact = base.artifactRecords[0]!;
    const artifactWorkspace = buildWorkspace({
      result: workspaceResult(),
      navigation: selectWorkspaceDetail(base.navigation, {
        selectedDetailKind: "artifact",
        selectedDetailId: artifact.artifactId
      })
    });
    const gapPrompt = gapWorkspace.detailRecord?.guidance?.agentPrompt ?? "";

    expect(diagnosticWorkspace.detailRecord).toMatchObject({
      kind: "diagnostic",
      status: "warning",
      guidance: {
        recommendedAction: expect.any(String),
        agentPrompt: expect.stringContaining("Quality scan diagnostic")
      }
    });
    expect(gapWorkspace.detailRecord).toMatchObject({
      kind: "gap",
      title: gap.residualRisk,
      summary: "Affected feature spec: Gap Target",
      fields: expect.arrayContaining([
        expect.objectContaining({
          label: "Affected feature spec",
          value: "Gap Target"
        }),
        expect.objectContaining({
          label: "Verification checks",
          value: "No exact verification command or test path is mapped."
        }),
        expect.objectContaining({
          label: "Recommended action",
          value: gap.nextProof.text
        })
      ]),
      guidance: {
        title: "Fix evidence gap",
        agentPrompt: expect.stringContaining("Fix the evidence gap")
      }
    });
    expect(gapPrompt).toContain("Source-of-truth inputs:\n- .quality/evidence/gap-target/quality-map.yaml");
    expect(gapPrompt).toContain("- specs/007-qa-gap-triage/spec.md");
    expect(gapPrompt).toContain("- specs/007-qa-gap-triage/plan.md");
    expect(gapPrompt).toContain("- specs/007-qa-gap-triage/data-model.md");
    expect(gapPrompt).toContain("- specs/007-qa-gap-triage/quickstart.md");
    expect(gapPrompt).toContain("- specs/007-qa-gap-triage/tasks.md");
    expect(gapPrompt).toContain(
      "Quality check:\n- .quality/evidence/gap-target/quality-map.yaml#expectation:missing"
    );
    expect(gapPrompt).toContain(
      "Verification checks to rerun:\n- No exact verification command or test path is mapped."
    );
    expect(gapPrompt).not.toContain("Failing checks or reproduction signals");
    expect(docOnlyGapWorkspace.detailRecord?.guidance?.agentPrompt ?? "").not.toContain("docs/deferred-check.md");
    expect(docOnlyGapWorkspace.detailRecord?.guidance?.agentPrompt ?? "").toContain(
      "Verification checks to rerun:\n- No exact verification command or test path is mapped."
    );
    expect(artifactWorkspace.detailRecord).toMatchObject({
      kind: "artifact",
      summary: expect.stringContaining("does not upload or mutate")
    });
  });
});
