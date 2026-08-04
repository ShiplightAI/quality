import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import type { ScanResult } from "../discovery/types";
import type {
  MarkdownArtifactSource,
  MarkdownFallbackBatch,
  ParsedMarkdownArtifact
} from "../markdown-fallback/types";
import type { ParsedProjectMapDocument, ParsedProjectMap } from "../project-map/types";
import type { SavedQcView, SavedQcViewParseBatch } from "./types";

function projectFeatureIds(map: ParsedProjectMapDocument | undefined): ReadonlySet<string> {
  return new Set((map?.features ?? []).map((feature) => feature.id));
}

function unknownFeatureIds(
  view: SavedQcView,
  map: ParsedProjectMapDocument | undefined
): readonly string[] {
  const known = projectFeatureIds(map);
  return view.featureIds.filter((featureId) => !known.has(featureId));
}

export function invalidSavedViewFeatureDiagnostics(input: {
  readonly views: SavedQcViewParseBatch;
  readonly projectMap: ParsedProjectMapDocument | undefined;
}): readonly ScanDiagnostic[] {
  return (input.views.primary?.document?.views ?? []).flatMap((view) =>
    unknownFeatureIds(view, input.projectMap).map((featureId) => ({
      severity: "warning" as const,
      code: "UNKNOWN_SAVED_VIEW_FEATURE",
      message: `Saved view ${view.id} references unknown project-map feature ${featureId}.`,
      affectedPath: input.views.primary?.source.projectRelativePath
    }))
  );
}

function isSavedViewValid(
  view: SavedQcView,
  map: ParsedProjectMapDocument | undefined
): boolean {
  return unknownFeatureIds(view, map).length === 0;
}

export function resolveSavedQcViews(result: ScanResult | undefined): readonly SavedQcView[] {
  const map = result?.projectMaps.primary?.map;
  return (result?.views.primary?.document?.views ?? []).filter((view) => isSavedViewValid(view, map));
}

export function findSavedQcView(
  result: ScanResult | undefined,
  viewId: string | undefined
): SavedQcView | undefined {
  if (viewId === undefined) {
    return undefined;
  }

  return resolveSavedQcViews(result).find((view) => view.id === viewId);
}

function repoScopedArtifact(artifact: ScanResult["artifacts"][number]): boolean {
  return artifact.kind === "project_map" ||
    artifact.kind === "views" ||
    artifact.kind === "observation_sources" ||
    artifact.kind === "observation_sets";
}

function allowedArtifactPaths(
  projectMap: ParsedProjectMap,
  view: SavedQcView
): ReadonlySet<string> {
  const selectedFeatures = projectMap.map?.features.filter((feature) => view.featureIds.includes(feature.id)) ?? [];
  const paths = new Set<string>([projectMap.source.projectRelativePath]);

  selectedFeatures.forEach((feature) => {
    if (feature.artifacts.specPath !== undefined) {
      paths.add(feature.artifacts.specPath);
    }
    if (feature.artifacts.planPath !== undefined) {
      paths.add(feature.artifacts.planPath);
    }
    if (feature.artifacts.tasksPath !== undefined) {
      paths.add(feature.artifacts.tasksPath);
    }
    if (feature.artifacts.qualityMapPath !== undefined) {
      paths.add(feature.artifacts.qualityMapPath);
    }
    if (feature.artifacts.testReportPath !== undefined) {
      paths.add(feature.artifacts.testReportPath);
    }
    feature.artifacts.checklistPaths.forEach((path) => paths.add(path));
  });

  return paths;
}

function filteredProjectMap(projectMap: ParsedProjectMap, view: SavedQcView): ParsedProjectMap {
  const map = projectMap.map;
  if (map === undefined) {
    return projectMap;
  }

  const allowedFeatureIds = new Set(view.featureIds);
  const features = map.features.filter((feature) => allowedFeatureIds.has(feature.id));

  return {
    ...projectMap,
    map: {
      ...map,
      activeFeature: map.activeFeature === undefined || !allowedFeatureIds.has(map.activeFeature.id)
        ? undefined
        : map.activeFeature,
      featureOrder: map.featureOrder.filter((featureId) => allowedFeatureIds.has(featureId)),
      features
    }
  };
}

function includesArtifactPath(
  sources: readonly MarkdownArtifactSource[],
  allowedPaths: ReadonlySet<string>
): boolean {
  return sources.some((source) => allowedPaths.has(source.projectRelativePath));
}

function filterParsedArtifacts(
  parsedArtifacts: readonly ParsedMarkdownArtifact[],
  allowedPaths: ReadonlySet<string>
): readonly ParsedMarkdownArtifact[] {
  return parsedArtifacts.filter((artifact) => allowedPaths.has(artifact.source.projectRelativePath));
}

function filterMarkdownFallback(
  markdownFallback: MarkdownFallbackBatch,
  allowedPaths: ReadonlySet<string>
): MarkdownFallbackBatch {
  return {
    fallbackTargets: markdownFallback.fallbackTargets.filter((target) =>
      includesArtifactPath(target.sourceArtifacts, allowedPaths)
    ),
    supplementalNarratives: markdownFallback.supplementalNarratives.filter((target) =>
      includesArtifactPath(target.sourceArtifacts, allowedPaths)
    ),
    parsedArtifacts: filterParsedArtifacts(markdownFallback.parsedArtifacts, allowedPaths),
    diagnostics: markdownFallback.diagnostics.filter((diagnostic) =>
      allowedPaths.has(diagnostic.artifactPath)
    )
  };
}

export function applySavedQcView(
  result: ScanResult | undefined,
  viewId: string | undefined
): ScanResult | undefined {
  if (result === undefined) {
    return undefined;
  }

  const projectMap = result.projectMaps.primary;
  const view = findSavedQcView(result, viewId);
  if (projectMap === undefined || projectMap.map === undefined || view === undefined) {
    return result;
  }

  const nextProjectMap = filteredProjectMap(projectMap, view);
  const allowedPaths = allowedArtifactPaths(nextProjectMap, view);
  const filteredArtifacts = result.artifacts.filter((artifact) =>
    repoScopedArtifact(artifact) || allowedPaths.has(artifact.projectRelativePath)
  );
  const filteredArtifactIds = new Set(filteredArtifacts.map((artifact) => artifact.id));

  return {
    ...result,
    artifacts: filteredArtifacts,
    projectMaps: {
      ...result.projectMaps,
      primary: nextProjectMap,
      results: result.projectMaps.results.map((candidate) =>
        candidate.source.projectRelativePath === projectMap.source.projectRelativePath ? nextProjectMap : candidate
      )
    },
    qualityMaps: {
      ...result.qualityMaps,
      results: result.qualityMaps.results.filter((candidate) =>
        allowedPaths.has(candidate.source.projectRelativePath)
      )
    },
    markdownFallback: filterMarkdownFallback(result.markdownFallback, allowedPaths),
    targetCandidates: result.targetCandidates.filter((candidate) =>
      candidate.artifactIds.some((artifactId) => filteredArtifactIds.has(artifactId))
    )
  };
}
