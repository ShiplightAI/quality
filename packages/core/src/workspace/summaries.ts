import { buildAnalyticsView } from "../analytics/compute-release-snapshot";
import type { ScanResult } from "../discovery/types";
import { buildEvidenceView } from "../evidence-view/build-evidence-view";
import { buildGapTriage } from "../gap-triage/build-gap-triage";
import { NO_SOURCE_PROVIDED_NEXT_EVIDENCE } from "../gap-triage/classify-gaps";
import type { GapCategory } from "../gap-triage/types";
import { buildOwnerView } from "../owner-view/build-owner-view";
import type { ParsedProjectMapDocument } from "../project-map/types";
import { projectEvidenceScores } from "./project-evidence-scores";
import type {
  IndexDiagnosticSeverityCounts,
  IndexTargetRow,
  ProjectIndex
} from "../project-index/types";
import type {
  TargetSummary,
  WorkspaceActionItem,
  WorkspaceAttentionCounts,
  WorkspaceFreshnessSummary,
  WorkspaceProjectSummary,
  WorkspaceProjectEvidenceSummary,
  WorkspaceReleaseRiskCounts,
  WorkspaceSourceMix,
  WorkspaceSummary
} from "./types";

const emptySeverityCounts: IndexDiagnosticSeverityCounts = {
  error: 0,
  warning: 0,
  info: 0
};

function countTargetDiagnostics(target: IndexTargetRow): IndexDiagnosticSeverityCounts {
  return target.diagnostics.reduce<IndexDiagnosticSeverityCounts>(
    (counts, diagnostic) => ({
      ...counts,
      [diagnostic.severity]: counts[diagnostic.severity] + 1
    }),
    emptySeverityCounts
  );
}

function countDiagnostics(index: ProjectIndex): IndexDiagnosticSeverityCounts {
  return index.diagnostics.details.reduce<IndexDiagnosticSeverityCounts>(
    (counts, diagnostic) => ({
      ...counts,
      [diagnostic.severity]: counts[diagnostic.severity] + 1
    }),
    emptySeverityCounts
  );
}

function riskCountsForTarget(result: ScanResult | undefined, targetId: string): WorkspaceReleaseRiskCounts {
  const analytics = buildAnalyticsView({ result, targetId });

  return {
    blockers: analytics.riskSummary.blockers.length,
    accepted: analytics.riskSummary.acceptedRisks.length,
    deferred: analytics.riskSummary.deferredRisks.length
  };
}

function gapCountsForTarget(result: ScanResult | undefined, targetId: string): Partial<Record<GapCategory, number>> {
  const triage = buildGapTriage({ result, targetId });
  const counts: Partial<Record<GapCategory, number>> = {};

  for (const summary of triage.summaries) {
    counts[summary.category] = summary.count;
  }

  return counts;
}

function openRiskCount(gaps: Partial<Record<GapCategory, number>>): number {
  return (
    (gaps.failing ?? 0) +
    (gaps.missing ?? 0) +
    (gaps.blocked ?? 0) +
    (gaps.unavailable ?? 0) +
    (gaps.weak ?? 0) +
    (gaps["manual-only"] ?? 0) +
    (gaps.stale ?? 0) +
    (gaps.deferred ?? 0)
  );
}

function sourceMixFor(targets: readonly IndexTargetRow[]): WorkspaceSourceMix {
  return targets.reduce<WorkspaceSourceMix>(
    (mix, target) => {
      if (target.sourceClassification === "project_map") {
        return { ...mix, projectMap: mix.projectMap + 1 };
      }

      if (target.sourceClassification === "structured_quality_map") {
        return { ...mix, structuredQualityMap: mix.structuredQualityMap + 1 };
      }

      if (target.sourceClassification === "parsed_markdown_fallback") {
        return { ...mix, parsedMarkdownFallback: mix.parsedMarkdownFallback + 1 };
      }

      return {
        ...mix,
        supplementalMarkdownNarrative: mix.supplementalMarkdownNarrative + 1
      };
    },
    {
      projectMap: 0,
      structuredQualityMap: 0,
      parsedMarkdownFallback: 0,
      supplementalMarkdownNarrative: 0
    }
  );
}

function priorityCountsFor(ownerPriorities: readonly string[]): Record<string, number> {
  return ownerPriorities.reduce<Record<string, number>>((counts, priority) => {
    counts[priority] = (counts[priority] ?? 0) + 1;
    return counts;
  }, {});
}

function riskIndicatorsFor(input: {
  readonly gapCounts: Partial<Record<GapCategory, number>>;
  readonly releaseRiskCounts: WorkspaceReleaseRiskCounts;
  readonly diagnosticCounts: IndexDiagnosticSeverityCounts;
  readonly status: string;
  readonly evidenceConfidence: string;
  readonly mapAvailability: string;
}): readonly string[] {
  const indicators: string[] = [];

  if (input.mapAvailability === "project_map_only") {
    indicators.push("No canonical evidence");
  }

  if (input.diagnosticCounts.error > 0) {
    indicators.push(`${input.diagnosticCounts.error} errors`);
  }

  if ((input.gapCounts.failing ?? 0) > 0) {
    indicators.push(`${input.gapCounts.failing} failing`);
  }

  if ((input.gapCounts.missing ?? 0) > 0) {
    indicators.push(`${input.gapCounts.missing} missing`);
  }

  if ((input.gapCounts.blocked ?? 0) > 0 || input.releaseRiskCounts.blockers > 0) {
    indicators.push(`${(input.gapCounts.blocked ?? 0) + input.releaseRiskCounts.blockers} blockers`);
  }

  if ((input.gapCounts.weak ?? 0) > 0) {
    indicators.push(`${input.gapCounts.weak} weak`);
  }

  if ((input.gapCounts["manual-only"] ?? 0) > 0) {
    indicators.push(`${input.gapCounts["manual-only"]} manual-only`);
  }

  if ((input.gapCounts.stale ?? 0) > 0) {
    indicators.push(`${input.gapCounts.stale} stale`);
  }

  if (input.releaseRiskCounts.deferred > 0) {
    indicators.push(`${input.releaseRiskCounts.deferred} deferred`);
  }

  if (indicators.length === 0) {
    indicators.push(input.status === "completed" && input.evidenceConfidence !== "LOW" ? "No immediate blockers" : "Review");
  }

  return indicators;
}

function evidenceConfidenceForTarget(target: IndexTargetRow): string {
  return target.mapAvailability === "project_map_only" && target.scope.toLowerCase() !== "project"
    ? "No canonical evidence"
    : target.evidenceConfidence;
}

export function buildTargetSummaries(
  result: ScanResult | undefined,
  index: ProjectIndex
): readonly TargetSummary[] {
  return index.targets.map((target) => {
    const owner = buildOwnerView({ result, targetId: target.targetId });
    const evidence = buildEvidenceView({ result, targetId: target.targetId });
    const gapCounts = gapCountsForTarget(result, target.targetId);
    const releaseRiskCounts = riskCountsForTarget(result, target.targetId);
    const diagnosticCounts = countTargetDiagnostics(target);
    const priorityCounts = priorityCountsFor(owner.expectations.map((expectation) => expectation.priority));
    const evidenceConfidence = evidenceConfidenceForTarget(target);
    // Structure confidence is already neutral (UNSPECIFIED) for project-map-only
    // rows, so no "No canonical evidence" override is needed here.
    const structureConfidence = target.structureConfidence;

    return {
      targetId: target.targetId,
      ...(target.featureKey === undefined ? {} : { featureKey: target.featureKey }),
      name: target.displayName,
      ...(target.description === undefined ? {} : { description: target.description }),
      scope: target.scope,
      sourceType: target.sourceClassification,
      status: target.status,
      evidenceConfidence,
      structureConfidence,
      mapAvailability: target.mapAvailability,
      priorityCounts,
      gapCounts,
      evidenceCount: evidence.canonicalEvidence.length,
      expectationCount: owner.expectations.length,
      diagnosticCounts,
      releaseRiskCounts,
      riskIndicators: riskIndicatorsFor({
        gapCounts,
        releaseRiskCounts,
        diagnosticCounts,
        status: target.status,
        evidenceConfidence,
        mapAvailability: target.mapAvailability
      }),
      sourceRefs: target.sourceReferences
    };
  });
}

function attentionCountsFor(targets: readonly TargetSummary[]): WorkspaceAttentionCounts {
  const gaps = targets.reduce<Partial<Record<GapCategory, number>>>((counts, target) => {
    for (const [category, count] of Object.entries(target.gapCounts) as [GapCategory, number][]) {
      counts[category] = (counts[category] ?? 0) + count;
    }

    return counts;
  }, {});

  return {
    covered: 0,
    partial:
      (gaps["manual-only"] ?? 0) +
      (gaps.weak ?? 0) +
      (gaps.stale ?? 0) +
      (gaps.deferred ?? 0),
    atRisk: openRiskCount(gaps),
    blocked: gaps.blocked ?? 0,
    missing: gaps.missing ?? 0,
    weak: gaps.weak ?? 0,
    manualOnly: gaps["manual-only"] ?? 0,
    stale: gaps.stale ?? 0,
    deferred: gaps.deferred ?? 0,
    unknown: gaps.unavailable ?? 0,
    gaps
  };
}

export function buildWorkspaceSummary(
  result: ScanResult | undefined,
  index: ProjectIndex,
  targets: readonly TargetSummary[]
): WorkspaceSummary {
  const attentionCounts = attentionCountsFor(targets);
  const releaseRiskCounts = targets.reduce<WorkspaceReleaseRiskCounts>(
    (counts, target) => ({
      blockers: counts.blockers + target.releaseRiskCounts.blockers,
      accepted: counts.accepted + target.releaseRiskCounts.accepted,
      deferred: counts.deferred + target.releaseRiskCounts.deferred
    }),
    {
      blockers: 0,
      accepted: 0,
      deferred: 0
    }
  );
  const diagnosticCounts = countDiagnostics(index);

  return {
    projectPath: result?.target.inputPath ?? "",
    targetCount: index.targets.length,
    artifactCount: result?.artifacts.length ?? 0,
    diagnosticCounts,
    attentionCounts,
    releaseRiskCounts,
    sourceMix: sourceMixFor(index.targets),
    generatedAt: result?.completedAt ?? new Date(0).toISOString(),
    overallStatus: result?.status ?? index.state
  };
}

function rollupStatusFor(input: {
  readonly targets: readonly TargetSummary[];
  readonly includedMapCount: number;
  readonly canonicalGapWeight: number;
}): string | undefined {
  if (input.includedMapCount === 0 && input.canonicalGapWeight === 0) {
    return undefined;
  }

  const blocked = input.targets.some((target) =>
    (target.gapCounts.blocked ?? 0) > 0 || target.releaseRiskCounts.blockers > 0
  );
  if (blocked) {
    return "BLOCKED";
  }

  const failing = input.targets.some((target) => (target.gapCounts.failing ?? 0) > 0);
  if (failing) {
    return "FAIL";
  }

  const openGaps = input.targets.some((target) => openRiskCount(target.gapCounts) > 0);
  if (openGaps || input.canonicalGapWeight > 0) {
    return "PARTIAL";
  }

  return "PASS";
}

export function projectEvidenceSummary(input: {
  readonly result: ScanResult | undefined;
  readonly targets: readonly TargetSummary[];
}): WorkspaceProjectEvidenceSummary | undefined {
  const scores = projectEvidenceScores(input.result);
  if (scores === undefined) {
    return undefined;
  }
  // The scores are observation-independent (project-evidence-scores.ts); only the
  // rollup status needs the per-target gap counts, so it is layered on here.
  return {
    status: rollupStatusFor({
      targets: input.targets,
      includedMapCount: scores.includedMapCount,
      canonicalGapWeight: scores.canonicalGapWeight
    }),
    ...scores.summary
  };
}

function latestEvidenceSummary(): Pick<WorkspaceFreshnessSummary, "latestEvidenceAt" | "latestEvidenceCommit" | "latestEvidenceSource"> {
  return {};
}

function featureTarget(input: {
  readonly featureId: string;
  readonly qualityMapPath?: string | undefined;
  readonly specPath?: string | undefined;
  readonly targets: readonly TargetSummary[];
}): TargetSummary | undefined {
  const featureTargets = input.targets.filter((target) => target.scope.toLowerCase() !== "project");

  return featureTargets.find((target) =>
    target.featureKey === input.featureId ||
    target.targetId === input.featureId ||
    target.sourceRefs.some((reference) =>
      reference.path !== undefined &&
      (reference.path === input.qualityMapPath || reference.path === input.specPath)
    )
  );
}

function gapSeverity(category: GapCategory): WorkspaceActionItem["severity"] {
  return category === "missing" || category === "blocked" || category === "failing" || category === "unavailable"
    ? "error"
    : "warning";
}

function priorityRank(priority: string): number {
  const normalized = priority.toUpperCase();
  if (normalized === "P0") {
    return 0;
  }
  if (normalized === "P1") {
    return 1;
  }
  if (normalized === "P2") {
    return 2;
  }
  return 3;
}

function humanizeIdentifier(value: string): string {
  return value
    .split(/[_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function milestoneLabelFor(input: {
  readonly map: ParsedProjectMapDocument;
  readonly milestoneId?: string;
}): string | undefined {
  if (input.milestoneId === undefined) {
    return undefined;
  }

  const feature = input.map.features.find((candidate) => candidate.id === input.milestoneId);
  if (feature !== undefined) {
    return feature.name;
  }

  return humanizeIdentifier(input.milestoneId);
}

function actionItemsFor(input: {
  readonly result: ScanResult | undefined;
  readonly targets: readonly TargetSummary[];
}): {
  readonly topRisks: readonly WorkspaceActionItem[];
  readonly nextProofs: readonly WorkspaceActionItem[];
  readonly totalRiskCount: number;
  readonly totalNextProofCount: number;
} {
  type RankedActionItem = WorkspaceActionItem & { readonly priority?: string };
  const map = input.result?.projectMaps.primary?.map;
  const featureByTargetId = new Map<string, { readonly id: string; readonly priority?: string }>();

  for (const feature of map?.features ?? []) {
    const target = featureTarget({
      featureId: feature.id,
      qualityMapPath: feature.artifacts.qualityMapPath,
      specPath: feature.artifacts.specPath,
      targets: input.targets
    });
    if (target !== undefined) {
      featureByTargetId.set(target.targetId, {
        id: feature.id,
        ...(feature.priority === undefined ? {} : { priority: feature.priority })
      });
    }
  }

  const mappedFeatureTargets = input.targets.filter((target) => featureByTargetId.has(target.targetId));

  const canonicalRisks: RankedActionItem[] = mappedFeatureTargets
    .filter((target) => target.mapAvailability === "project_map_only")
    .map((target) => {
      const feature = featureByTargetId.get(target.targetId);
      const projectStructurePath = target.sourceRefs.find((reference) =>
        reference.label === "Project structure" ||
        reference.label === "Project map"
      )?.path;

      return {
        id: `canonical:${target.targetId}`,
        targetId: target.targetId,
        targetName: target.name,
        label: target.name,
        section: "overview" as const,
        detailKind: "target" as const,
        detailId: target.targetId,
        severity: "warning" as const,
        reason: "No canonical quality-map.yaml is attached to this project-structure feature.",
        nextAction: `Add a slug-matched quality map for ${feature?.id ?? target.name}, or update the project structure quality_map_path to the canonical evidence file.`,
        ...(feature?.priority === undefined ? {} : { priority: feature.priority }),
        ...(projectStructurePath === undefined ? {} : { sourcePath: projectStructurePath })
      };
    });

  const gapItems: RankedActionItem[] = mappedFeatureTargets.flatMap((target) =>
    buildGapTriage({ result: input.result, targetId: target.targetId }).records.map((gap) => {
      const sourcePath = gap.sourceReferences.find((reference) => reference.path !== undefined)?.path;
      return {
        id: gap.gapId,
        targetId: target.targetId,
        targetName: target.name,
        label: gap.expectationTitle,
        section: "gaps" as const,
        detailKind: "gap" as const,
        detailId: gap.gapId,
        severity: gapSeverity(gap.category),
        reason: `${gap.categoryLabel}: ${gap.residualRisk}`,
        nextAction: gap.nextProof.text,
        ...(sourcePath === undefined ? {} : { sourcePath }),
        priority: gap.priority
      };
    })
  );

  const rankedRisks = [...canonicalRisks, ...gapItems]
    .toSorted((left, right) => {
      const severityRank = { error: 0, warning: 1, info: 2 } as const;
      const severityDelta = severityRank[left.severity] - severityRank[right.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      const priorityDelta = priorityRank(left.priority ?? "unknown") -
        priorityRank(right.priority ?? "unknown");
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.label.localeCompare(right.label);
    });

  const seenEvidenceRequests = new Set<string>();
  const allNextProofs = gapItems.flatMap((item) => {
    const evidenceRequestKey = `${item.targetId ?? "project"}::${item.nextAction}`;
    if (
      item.nextAction === NO_SOURCE_PROVIDED_NEXT_EVIDENCE ||
      seenEvidenceRequests.has(evidenceRequestKey)
    ) {
      return [];
    }

    seenEvidenceRequests.add(evidenceRequestKey);
    return [item];
  });

  return {
    topRisks: rankedRisks,
    nextProofs: allNextProofs,
    totalRiskCount: rankedRisks.length,
    totalNextProofCount: allNextProofs.length
  };
}

function freshnessFor(input: {
  readonly result: ScanResult | undefined;
  readonly projectEvidence?: WorkspaceProjectEvidenceSummary | undefined;
}): WorkspaceFreshnessSummary {
  const map = input.result?.projectMaps.primary?.map;
  const latestEvidence = latestEvidenceSummary();
  const driftWarnings = [
    ...(map?.discovery.unresolvedDrift ?? []),
    ...(map?.discovery.evidenceGaps ?? [])
  ];

  return {
    ...latestEvidence,
    ...(input.projectEvidence === undefined ? {} : { projectEvidence: input.projectEvidence }),
    driftWarnings: [...new Set(driftWarnings)].slice(0, 8)
  };
}

export function buildWorkspaceProjectSummary(input: {
  readonly result: ScanResult | undefined;
  readonly targets: readonly TargetSummary[];
}): WorkspaceProjectSummary | undefined {
  const map = input.result?.projectMaps.primary?.map;
  if (map === undefined) {
    return undefined;
  }

  const projectEvidence = projectEvidenceSummary(input);
  const actionItems = actionItemsFor(input);

  return {
    projectName: map.project.name,
    ...(map.currentMilestone === undefined ? {} : { currentMilestone: map.currentMilestone }),
    ...(map.currentMilestone === undefined
      ? {}
      : { currentMilestoneLabel: milestoneLabelFor({ map, milestoneId: map.currentMilestone }) }),
    totalRiskCount: actionItems.totalRiskCount,
    totalNextProofCount: actionItems.totalNextProofCount,
    topRisks: actionItems.topRisks,
    nextProofs: actionItems.nextProofs,
    freshness: freshnessFor({
      result: input.result,
      projectEvidence
    })
  };
}
