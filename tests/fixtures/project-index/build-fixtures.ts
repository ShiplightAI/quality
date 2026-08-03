import type {
  DiscoveredArtifact,
  MarkdownFallbackBatch,
  ProjectScanTarget,
  QualityMapParseBatch,
  ScanResult
} from "@shiplightai/quality-core";

export function projectIndexScanResult(input: {
  readonly artifacts?: readonly DiscoveredArtifact[];
  readonly qualityMaps: QualityMapParseBatch;
  readonly projectMaps?: ScanResult["projectMaps"];
  readonly views?: ScanResult["views"];
  readonly markdownFallback: MarkdownFallbackBatch;
  readonly diagnostics?: ScanResult["diagnostics"];
  readonly status?: ScanResult["status"];
}): ScanResult {
  const target: ProjectScanTarget = {
    inputPath: "/fixture/project",
    resolvedPath: "/fixture/project",
    displayName: "Project",
    validationStatus: "valid"
  };

  return {
    status: input.status ?? "completed",
    target,
    artifacts: input.artifacts ?? [],
    projectMaps: input.projectMaps ?? {
      results: [],
      diagnostics: []
    },
    views: input.views ?? {
      results: [],
      diagnostics: []
    },
    qualityMaps: input.qualityMaps,
    observationSourceProfiles: {
      results: [],
      diagnostics: []
    },
    observationSets: {
      results: [],
      diagnostics: []
    },
    sources: {
      diagnostics: []
    },
    markdownFallback: input.markdownFallback,
    targetCandidates: [],
    diagnostics: input.diagnostics ?? [],
    startedAt: "2026-05-30T00:00:00Z",
    completedAt: "2026-05-30T00:00:01Z"
  };
}
