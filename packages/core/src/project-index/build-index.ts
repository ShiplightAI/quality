import type { NormalizedQualityGraphResult } from "@shiplightai/quality-map";
import type {
  ParsedProjectMapDocument,
  ParsedProjectMap,
  ProjectMapFeature,
  ProjectMapSourceReference
} from "../project-map/types";
import { deriveExpectationAssessment, isFeatureConfirmed } from "../quality-structure/assessment";
import type { StructureConfidenceLevel } from "../quality-structure/assessment";
import { buildDiagnosticSummary } from "./diagnostics";
import type {
  BuildProjectIndexInput,
  IndexDiagnosticDetail,
  IndexSourceReference,
  IndexTargetRow,
  ProjectIndex
} from "./types";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";

function unavailable(value: string | undefined | null): string {
  return value === undefined || value === null || value.length === 0 ? "unknown" : value;
}

function structuredSourceReferences(result: NormalizedQualityGraphResult): readonly IndexSourceReference[] {
  const graph = result.graph;
  if (graph === undefined) {
    return [];
  }

  const qualityMapReference = { path: result.source.projectRelativePath, label: "Quality map" };
  const refs = graph.sourceRefs.map((sourceRef) => ({
    label: sourceRef.label,
    path: sourceRef.path,
    url: sourceRef.url
  }));

  return dedupeSourceReferences([qualityMapReference, ...refs]);
}

function projectMapSourceReference(reference: ProjectMapSourceReference): IndexSourceReference {
  return {
    label: reference.label,
    path: reference.path,
    url: reference.url
  };
}

function dedupeSourceReferences(references: readonly IndexSourceReference[]): readonly IndexSourceReference[] {
  const seen = new Set<string>();
  const unique: IndexSourceReference[] = [];

  references.forEach((reference, index) => {
    const key =
      reference.path !== undefined
        ? `path:${reference.path}`
        : reference.url !== undefined
          ? `url:${reference.url}`
          : reference.label !== undefined
            ? `label:${reference.label}`
            : `unknown:${index}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    unique.push(reference);
  });

  return unique;
}

function sourcePaths(references: readonly IndexSourceReference[]): readonly string[] {
  return references
    .map((reference) => reference.path)
    .filter((path): path is string => path !== undefined);
}

function diagnosticDetailsForTarget(
  allDetails: readonly IndexDiagnosticDetail[],
  targetId: string,
  sourcePaths: readonly string[]
): readonly IndexDiagnosticDetail[] {
  return allDetails.filter(
    (detail) =>
      detail.affectedTargetId === targetId ||
      (detail.sourcePath !== undefined && sourcePaths.includes(detail.sourcePath))
  );
}

function qualityMapResultByPath(
  input: BuildProjectIndexInput
): ReadonlyMap<string, NormalizedQualityGraphResult> {
  return new Map(
    (input.result?.qualityMaps.results ?? [])
      .filter((result) => result.graph !== undefined)
      .map((result) => [result.source.projectRelativePath, result])
  );
}

function featureSourceReferences(input: {
  readonly projectMap: ParsedProjectMap;
  readonly feature: ProjectMapFeature;
  readonly qualityMap?: NormalizedQualityGraphResult;
}): readonly IndexSourceReference[] {
  const artifactRefs: IndexSourceReference[] = [
    { path: input.projectMap.source.projectRelativePath, label: "Project structure" }
  ];

  if (input.feature.artifacts.specPath !== undefined) {
    artifactRefs.push({ path: input.feature.artifacts.specPath, label: "Feature spec" });
  }

  if (input.feature.artifacts.planPath !== undefined) {
    artifactRefs.push({ path: input.feature.artifacts.planPath, label: "Feature plan" });
  }

  if (input.feature.artifacts.tasksPath !== undefined) {
    artifactRefs.push({ path: input.feature.artifacts.tasksPath, label: "Feature tasks" });
  }

  if (input.feature.artifacts.qualityMapPath !== undefined) {
    artifactRefs.push({ path: input.feature.artifacts.qualityMapPath, label: "Quality map" });
  }

  if (input.feature.artifacts.testReportPath !== undefined) {
    artifactRefs.push({ path: input.feature.artifacts.testReportPath, label: "Test report" });
  }

  for (const checklistPath of input.feature.artifacts.checklistPaths) {
    artifactRefs.push({ path: checklistPath, label: "Checklist" });
  }

  for (const evidenceRef of input.feature.evidenceRefs) {
    artifactRefs.push({ path: evidenceRef, label: "Evidence" });
  }

  return dedupeSourceReferences([
    ...artifactRefs,
    ...(input.qualityMap === undefined ? [] : structuredSourceReferences(input.qualityMap))
  ]);
}

function projectSourceReferences(input: {
  readonly projectMap: ParsedProjectMap;
  readonly map: ParsedProjectMapDocument;
}): readonly IndexSourceReference[] {
  return dedupeSourceReferences([
    { path: input.projectMap.source.projectRelativePath, label: "Project structure" },
    ...(input.map.project.qualityPolicyPath === undefined
      ? []
      : [{ path: input.map.project.qualityPolicyPath, label: "Quality policy" }]),
    ...input.map.project.sourceRefs.map(projectMapSourceReference),
    ...input.map.productDocs.map(projectMapSourceReference)
  ]);
}

// Worst (most severe) level present, scanning severityOrder from worst to best.
// Returns undefined when none are present.
function worstLevel<T extends string>(levels: readonly T[], severityOrder: readonly T[]): T | undefined {
  return severityOrder.find((level) => levels.includes(level));
}

const EVIDENCE_CONFIDENCE_SEVERITY = ["LOW", "MEDIUM", "HIGH"] as const;

// UNSPECIFIED is the worst structure level: it scores 0, matching the workspace
// structure-confidence score that now counts undeclared provenance instead of
// excluding it. So a feature with any unspecified check reads UNSPECIFIED here.
const STRUCTURE_CONFIDENCE_SEVERITY = ["UNSPECIFIED", "LOW", "MEDIUM", "HIGH"] as const;

function worstStructureConfidence(labels: readonly StructureConfidenceLevel[]): StructureConfidenceLevel {
  return worstLevel(labels, STRUCTURE_CONFIDENCE_SEVERITY) ?? "UNSPECIFIED";
}

// Human review (gate 2 confirmed AND gate 4 approved) lifts a feature's structure
// confidence to HIGH regardless of its checks' origins, mirroring structureLevel
// on the score. Unreviewed, the worst origin label stands.
function reviewedStructureLabel(label: StructureConfidenceLevel, reviewed: boolean): StructureConfidenceLevel {
  return reviewed ? "HIGH" : label;
}

function structuredSummary(result: NormalizedQualityGraphResult | undefined): {
  readonly status: string;
  readonly evidenceConfidence: string;
  readonly structureConfidence: StructureConfidenceLevel;
} | undefined {
  const graph = result?.graph;
  if (graph === undefined || graph.expectations.length === 0) {
    return undefined;
  }

  const assessments = graph.expectations.map((expectation) => deriveExpectationAssessment(graph, expectation));
  const status = assessments.some((assessment) => assessment.status === "NOT COVERED")
    ? "NOT COVERED"
    : assessments.some((assessment) =>
          assessment.status === "PARTIAL" ||
          assessment.status === "MANUAL" ||
          assessment.status === "IMPLICIT"
        )
      ? "PARTIAL"
      : "COVERED";
  const evidenceConfidence =
    worstLevel(assessments.map((assessment) => assessment.evidenceConfidence), EVIDENCE_CONFIDENCE_SEVERITY) ?? "HIGH";
  const structureConfidence = worstStructureConfidence(
    assessments.map((assessment) => assessment.structureConfidence)
  );

  return { status, evidenceConfidence, structureConfidence };
}

interface ProjectMapRowsResult {
  readonly rows: readonly IndexTargetRow[];
  readonly consumedArtifactPaths: ReadonlySet<string>;
}

function projectMapTargetRows(
  input: BuildProjectIndexInput,
  details: readonly IndexDiagnosticDetail[]
): ProjectMapRowsResult {
  const projectMap = input.result?.projectMaps.primary;
  const map = projectMap?.map;
  if (projectMap === undefined || map === undefined) {
    return {
      rows: [],
      consumedArtifactPaths: new Set()
    };
  }

  const byQualityMapPath = qualityMapResultByPath(input);
  const consumedArtifactPaths = new Set<string>([projectMap.source.projectRelativePath]);
  const projectRefs = projectSourceReferences({
    projectMap,
    map
  });
  const projectTargetId = `project-map:${map.project.id}`;
  const rows: IndexTargetRow[] = [
    {
      targetId: projectTargetId,
      displayName: map.project.name,
      description: map.project.summary,
      scope: "project",
      sourceClassification: "project_map",
      status: "current",
      // The project-map row is the document itself, not a scored quality target, so
      // it has no evidence/structure confidence — show an em-dash, not a fake level
      // or a raw sentinel string.
      evidenceConfidence: "—",
      structureConfidence: "—",
      mapAvailability: "project_map",
      sortOrder: -1,
      sourceReferences: projectRefs,
      diagnostics: diagnosticDetailsForTarget(details, projectTargetId, sourcePaths(projectRefs))
    }
  ];

  const featureOrder = new Map(map.featureOrder.map((featureId, index) => [featureId, index]));
  const features = [...map.features].toSorted((left, right) => {
    const leftOrder = featureOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = featureOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder === rightOrder ? left.id.localeCompare(right.id) : leftOrder - rightOrder;
  });

  for (const feature of features) {
    const qualityMap = feature.artifacts.qualityMapPath === undefined
      ? undefined
      : byQualityMapPath.get(feature.artifacts.qualityMapPath);
    const refs = featureSourceReferences({ projectMap, feature, qualityMap });
    const summary = structuredSummary(qualityMap);

    for (const refPath of sourcePaths(refs)) {
      consumedArtifactPaths.add(refPath);
    }

    rows.push({
      targetId: qualityMap?.graph?.target.normalizedId ?? feature.id,
      featureKey: feature.id,
      displayName: feature.name,
      description: feature.description,
      scope: "feature",
      sourceClassification: "project_map",
      status: summary?.status ?? feature.status,
      // No quality map => no proof (penalize evidence) but no declared
      // provenance either, so structure confidence stays neutral/excluded.
      evidenceConfidence: qualityMap === undefined
        ? "No canonical evidence"
        : summary?.evidenceConfidence ?? "unknown",
      structureConfidence: qualityMap === undefined
        ? "UNSPECIFIED"
        : reviewedStructureLabel(
            summary?.structureConfidence ?? "UNSPECIFIED",
            isFeatureConfirmed(feature.status) && qualityMap.graph?.checksReviewed === true
          ),
      mapAvailability: qualityMap === undefined ? "project_map_only" : "available",
      sortOrder: featureOrder.get(feature.id),
      sourceReferences: refs,
      diagnostics: diagnosticDetailsForTarget(
        details,
        qualityMap?.graph?.target.normalizedId ?? feature.id,
        sourcePaths(refs)
      )
    });
  }

  return {
    rows,
    consumedArtifactPaths
  };
}

function structuredTargetRows(
  input: BuildProjectIndexInput,
  details: readonly IndexDiagnosticDetail[]
): readonly IndexTargetRow[] {
  return (input.result?.qualityMaps.results ?? [])
    .filter((result) => result.graph !== undefined)
    .map((result) => {
      const graph = result.graph;
      if (graph === undefined) {
        throw new Error("Structured target row requires a graph.");
      }

      const summary = structuredSummary(result);
      return {
        targetId: graph.target.normalizedId,
        displayName: unavailable(graph.target.name),
        scope: unavailable(graph.target.scope),
        sourceClassification: "structured_quality_map",
        status: summary?.status ?? result.status,
        evidenceConfidence: summary?.evidenceConfidence ?? "unknown",
        // No project-map feature here, so gate 2 is vacuously confirmed; gate 4
        // (the graph's review flag) alone decides whether review lifts it to HIGH.
        structureConfidence: reviewedStructureLabel(summary?.structureConfidence ?? "UNSPECIFIED", graph.checksReviewed),
        mapAvailability: "available",
        sourceReferences: structuredSourceReferences(result),
        diagnostics: diagnosticDetailsForTarget(details, graph.target.normalizedId, [
          result.source.projectRelativePath
        ])
      } satisfies IndexTargetRow;
    });
}

function fallbackTargetRows(
  input: BuildProjectIndexInput,
  details: readonly IndexDiagnosticDetail[]
): readonly IndexTargetRow[] {
  return (input.result?.markdownFallback.fallbackTargets ?? []).map((target) => ({
    targetId: target.targetIdentity,
    displayName: unavailable(target.displayLabel),
    scope: "unknown",
    sourceClassification: "parsed_markdown_fallback",
    status: "unknown",
    evidenceConfidence: target.coverageRows.find((row) => row.confidence !== undefined)?.confidence ?? "unknown",
    structureConfidence: "UNSPECIFIED",
    mapAvailability: "unavailable",
    sourceReferences: dedupeSourceReferences(
      target.sourceArtifacts.length === 0
        ? []
        : target.sourceArtifacts.map((source) => ({
            path: source.projectRelativePath,
            label: source.artifactType === "test_spec" ? "Test spec" : "Test report"
          }))
    ),
    diagnostics: diagnosticDetailsForTarget(
      details,
      target.targetIdentity,
      target.sourceArtifacts.map((source) => source.projectRelativePath)
    )
  }));
}

const scopeRank = new Map<string, number>([
  ["project", 0],
  ["feature", 1],
  ["module", 2],
  ["pr", 3],
  ["ticket", 4],
  ["unknown", 5]
]);

const sourceRank = new Map<IndexTargetRow["sourceClassification"], number>([
  ["project_map", 0],
  ["structured_quality_map", 1],
  ["parsed_markdown_fallback", 2],
  ["supplemental_markdown_narrative", 3]
]);

function sortTargets(targets: readonly IndexTargetRow[]): readonly IndexTargetRow[] {
  return [...targets].toSorted((left, right) => {
    const leftRank = scopeRank.get(left.scope.toLowerCase()) ?? 5;
    const rightRank = scopeRank.get(right.scope.toLowerCase()) ?? 5;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftSourceRank = sourceRank.get(left.sourceClassification) ?? 4;
    const rightSourceRank = sourceRank.get(right.sourceClassification) ?? 4;
    if (leftSourceRank !== rightSourceRank) {
      return leftSourceRank - rightSourceRank;
    }

    if (left.sortOrder !== undefined || right.sortOrder !== undefined) {
      return (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER);
    }

    return left.targetId.localeCompare(right.targetId);
  });
}

function stateFor(input: BuildProjectIndexInput, targetCount: number, diagnosticCount: number): ProjectIndex["state"] {
  if (input.isLoading === true) {
    return "loading";
  }

  if (input.result === undefined) {
    return diagnosticCount > 0 ? "invalidProject" : "empty";
  }

  if (input.result.status === "failed") {
    return "invalidProject";
  }

  if (targetCount === 0 && input.result.artifacts.length === 0 && input.result.status !== "partial") {
    return "empty";
  }

  if (diagnosticCount > 0 || input.result.status === "partial") {
    return "partialDiagnostics";
  }

  return "success";
}

export function buildProjectIndex(input: BuildProjectIndexInput): ProjectIndex {
  const diagnostics = buildDiagnosticSummary(input.result, input.extraDiagnostics);
  const projectMapRows = projectMapTargetRows(input, diagnostics.details);
  const projectMapTargetIds = new Set(projectMapRows.rows.map((row) => row.targetId));
  const representedByProjectMap = (row: IndexTargetRow): boolean =>
    projectMapTargetIds.has(row.targetId) ||
    row.sourceReferences.some((reference) => {
      if (reference.path === undefined) {
        return false;
      }

      return projectMapRows.consumedArtifactPaths.has(reference.path);
    });
  const targets = sortTargets([
    ...projectMapRows.rows,
    ...structuredTargetRows(input, diagnostics.details).filter((row) => !representedByProjectMap(row)),
    ...fallbackTargetRows(input, diagnostics.details).filter((row) => !representedByProjectMap(row))
  ]);

  return {
    state: stateFor(input, targets.length, diagnostics.details.length),
    result: input.result,
    targets,
    diagnostics
  };
}

export function detectSourceClassificationChanges(
  previous: ProjectIndex,
  next: ProjectIndex
): readonly ScanDiagnostic[] {
  function refreshKey(target: IndexTargetRow): string {
    if (!target.targetId.includes("#target:")) {
      return target.targetId;
    }

    const sourcePath = target.sourceReferences.find((reference) => reference.path !== undefined)?.path;
    if (sourcePath !== undefined) {
      const separatorIndex = sourcePath.lastIndexOf("/");
      return separatorIndex === -1 ? sourcePath : sourcePath.slice(0, separatorIndex);
    }

    return target.targetId;
  }

  const previousByKey = new Map(previous.targets.map((target) => [refreshKey(target), target]));
  const diagnostics: ScanDiagnostic[] = [];

  for (const nextTarget of next.targets) {
    const previousTarget = previousByKey.get(refreshKey(nextTarget));
    if (
      previousTarget !== undefined &&
      previousTarget.sourceClassification !== nextTarget.sourceClassification
    ) {
      diagnostics.push({
        severity: "info",
        code: "TARGET_SOURCE_CLASSIFICATION_CHANGED",
        message: `Target ${nextTarget.displayName} changed source classification from ${previousTarget.sourceClassification} to ${nextTarget.sourceClassification}.`,
        affectedPath: nextTarget.targetId
      });
    }
  }

  return diagnostics;
}
