import type { NormalizedQualityGraphResult } from "@shiplightai/quality-map";
import type { ScanResult } from "../discovery/types";
import type { ProjectMapFeature } from "../project-map/types";
import {
  deriveExpectationAssessment,
  isFeatureConfirmed,
  isUnspecifiedProvenance,
  structurePoints
} from "../quality-structure/assessment";
import { priorityWeight } from "../quality-structure/priority";
import type { WorkspaceProjectEvidenceSummary } from "./types";

// The score core is deliberately kept in its own module, importing only the
// assessment + priority primitives — never the dashboard view machinery
// (analytics / gap-triage / owner-view / evidence-view) that the rest of
// summaries.ts pulls in. That keeps the CLI recommendation export (which only
// needs these scores) from bundling the whole project-index build.

function coverageStatusPoints(status: string | undefined): number {
  switch (status?.toUpperCase()) {
    case "COVERED":
    case "PASS":
      return 1;
    case "PARTIAL":
      return 0.6;
    case "IMPLICIT":
      return 0.5;
    case "MANUAL":
      return 0.4;
    case "DEFERRED":
      return 0.25;
    default:
      return 0;
  }
}

function qualityStatePoints(status: string | undefined): number {
  switch (status?.toUpperCase()) {
    case "COVERED":
    case "PASS":
      return 1;
    case "PARTIAL":
      return 0.7;
    case "MANUAL":
      return 0.55;
    case "IMPLICIT":
      return 0.45;
    case "DEFERRED":
      return 0.25;
    default:
      return 0;
  }
}

function evidenceConfidencePoints(value: string | undefined): number {
  switch (value?.toUpperCase()) {
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 0.7;
    case "LOW":
      return 0.35;
    default:
      return 0;
  }
}

function scoreLabel(score: number | undefined): string | undefined {
  if (score === undefined) {
    return undefined;
  }

  if (score >= 80) {
    return "HIGH";
  }

  if (score >= 55) {
    return "MEDIUM";
  }

  return "LOW";
}

function qualityMapsForProjectRollup(
  result: ScanResult | undefined
): readonly NormalizedQualityGraphResult[] {
  const qualityMaps = (result?.qualityMaps.results ?? []).filter((candidate) =>
    candidate.graph !== undefined && candidate.document !== undefined
  );
  const projectMap = result?.projectMaps.primary?.map;

  if (projectMap === undefined) {
    return qualityMaps;
  }

  const featureQualityMapPaths = new Set(
    projectMap.features
      .map((feature) => feature.artifacts.qualityMapPath)
      .filter((path): path is string => path !== undefined)
  );

  return qualityMaps.filter((candidate) =>
    featureQualityMapPaths.has(candidate.source.projectRelativePath)
  );
}

// Features declared in the project map that have no valid quality map: their gap
// is scored as zero quality/coverage, weighted by feature priority. Derived
// straight from the scan — this mirrors build-index's `project_map_only`
// classification (a feature whose qualityMapPath does not resolve to a scanned
// map with a valid graph), so scoring needs no project-index build.
function projectMapOnlyFeatures(result: ScanResult | undefined): readonly ProjectMapFeature[] {
  const projectMap = result?.projectMaps.primary?.map;
  if (projectMap === undefined) {
    return [];
  }
  const validGraphPaths = new Set(
    (result?.qualityMaps.results ?? [])
      .filter((entry) => entry.graph !== undefined)
      .map((entry) => entry.source.projectRelativePath)
  );
  return projectMap.features.filter(
    (feature) =>
      feature.artifacts.qualityMapPath === undefined ||
      !validGraphPaths.has(feature.artifacts.qualityMapPath)
  );
}

export interface ProjectEvidenceScores {
  // The evidence summary WITHOUT its rollup `status` — that field needs the full
  // per-target gap counts, which the score aggregation does not.
  readonly summary: WorkspaceProjectEvidenceSummary;
  readonly includedMapCount: number;
  readonly canonicalGapWeight: number;
}

// Observation-independent scores aggregated from the scanned quality maps alone.
// The single source of truth for both the web dashboard's project evidence
// summary and the CLI recommendation export, so the two can never drift.
export function projectEvidenceScores(result: ScanResult | undefined): ProjectEvidenceScores | undefined {
  const includedMaps = qualityMapsForProjectRollup(result);
  const projectMap = result?.projectMaps.primary?.map;

  const contributions: Array<{
    readonly weight: number;
    readonly quality: number;
    readonly coverage: number;
    readonly evidenceConfidence: number;
    // Structure confidence keeps its own weight so a feature with NO quality map
    // is excluded from the denominator (its gap is already counted in coverage).
    // A declared check always counts here, scoring 0 when its provenance is
    // unspecified rather than being excluded.
    readonly structureWeight: number;
    readonly structureConfidence: number;
    // Whether the check's provenance is unspecified, by identity — used for the
    // aggregate label so it doesn't infer "unspecified" from a 0 score value.
    readonly structureUnspecified: boolean;
  }> = [];

  for (const map of includedMaps) {
    const graph = map.graph;
    if (graph === undefined) {
      continue;
    }

    // A check counts as HIGH structure confidence once a human has reviewed it:
    // gate 2 (the feature is confirmed, not a candidate) AND gate 4 (its check
    // list was approved). Unreviewed, it falls back to its origin's trust. Join
    // the quality map back to its project-map feature by path for gate 2.
    const feature = projectMap?.features.find(
      (candidate) => candidate.artifacts.qualityMapPath === map.source.projectRelativePath
    );
    const reviewed = isFeatureConfirmed(feature?.status) && graph.checksReviewed;

    for (const expectation of graph.expectations) {
      const assessment = deriveExpectationAssessment(graph, expectation);
      const weight = priorityWeight(expectation.priority);
      // Quality/coverage use the accepted-risk-adjusted status: an accepted gap
      // (see `accepted_gaps`) stops dragging the score. Evidence confidence keeps
      // using the raw signal — acceptance never inflates proof confidence.
      const quality = qualityStatePoints(assessment.scoreStatus);
      const structureScore = structurePoints(assessment.structureProvenance, reviewed);

      contributions.push({
        weight,
        quality,
        coverage: coverageStatusPoints(assessment.scoreStatus),
        evidenceConfidence: evidenceConfidencePoints(assessment.evidenceConfidence),
        // A declared check always counts toward structure confidence.
        structureWeight: weight,
        structureConfidence: structureScore,
        structureUnspecified: isUnspecifiedProvenance(assessment.structureProvenance)
      });
    }
  }

  const unmappedFeatures = projectMapOnlyFeatures(result);
  const canonicalGapWeight = unmappedFeatures.reduce(
    (total, feature) => total + priorityWeight(feature.priority),
    0
  );

  for (const feature of unmappedFeatures) {
    contributions.push({
      weight: priorityWeight(feature.priority),
      quality: 0,
      coverage: 0,
      evidenceConfidence: 0,
      // No quality map means no declared provenance: excluded from structure
      // confidence (the gap is already penalized in evidence and coverage).
      structureWeight: 0,
      structureConfidence: 0,
      structureUnspecified: false
    });
  }

  if (contributions.length === 0) {
    return undefined;
  }

  const totalWeight = contributions.reduce((sum, item) => sum + item.weight, 0);
  const structureWeightTotal = contributions.reduce((sum, item) => sum + item.structureWeight, 0);
  const qualityScoreValue = totalWeight === 0
    ? undefined
    : Math.round((contributions.reduce((sum, item) => sum + item.weight * item.quality, 0) / totalWeight) * 100);
  const coverageScoreValue = totalWeight === 0
    ? undefined
    : Math.round((contributions.reduce((sum, item) => sum + item.weight * item.coverage, 0) / totalWeight) * 100);
  const evidenceConfidenceScoreValue = totalWeight === 0
    ? undefined
    : Math.round((contributions.reduce((sum, item) => sum + item.weight * item.evidenceConfidence, 0) / totalWeight) * 100);
  const structureConfidenceScoreValue = structureWeightTotal === 0
    ? undefined
    : Math.round(
        (contributions.reduce((sum, item) => sum + item.structureWeight * item.structureConfidence, 0) /
          structureWeightTotal) *
          100
      );
  // When every structure-bearing check is unspecified (all score 0), the rolled-up
  // label is UNSPECIFIED, not LOW — matching the per-check labels and the help page.
  const structureContributions = contributions.filter((item) => item.structureWeight > 0);
  const allUnspecified = structureContributions.length > 0 && structureContributions.every((item) => item.structureUnspecified);
  const aggregateStructureLabel = structureConfidenceScoreValue === undefined
    ? undefined
    : allUnspecified ? "UNSPECIFIED" : scoreLabel(structureConfidenceScoreValue);
  const totalCheckCount = includedMaps.reduce((count, map) => count + (map.graph?.expectations.length ?? 0), 0);
  const basis =
    includedMaps.length === 0
      ? "Derived from project structure only; no canonical quality-map.yaml files are attached yet."
      : `Derived from project structure and ${includedMaps.length} feature quality map${includedMaps.length === 1 ? "" : "s"}.`;

  const summary: WorkspaceProjectEvidenceSummary = {
    ...(scoreLabel(evidenceConfidenceScoreValue) === undefined ? {} : { evidenceConfidence: scoreLabel(evidenceConfidenceScoreValue) }),
    ...(aggregateStructureLabel === undefined ? {} : { structureConfidence: aggregateStructureLabel }),
    ...(qualityScoreValue === undefined ? {} : { qualityScore: String(qualityScoreValue) }),
    ...(coverageScoreValue === undefined ? {} : { coverageScore: String(coverageScoreValue) }),
    ...(evidenceConfidenceScoreValue === undefined ? {} : { evidenceConfidenceScore: String(evidenceConfidenceScoreValue) }),
    ...(structureConfidenceScoreValue === undefined ? {} : { structureConfidenceScore: String(structureConfidenceScoreValue) }),
    totalCheckCount,
    basis,
    ...(includedMaps.length === 1 ? { sourcePath: includedMaps[0]!.source.projectRelativePath } : {})
  };

  return { summary, includedMapCount: includedMaps.length, canonicalGapWeight };
}
