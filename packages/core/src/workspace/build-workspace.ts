import { buildAnalyticsView } from "../analytics/compute-release-snapshot";
import { buildEvidenceView } from "../evidence-view/build-evidence-view";
import { buildGapTriage } from "../gap-triage/build-gap-triage";
import { buildOwnerView } from "../owner-view/build-owner-view";
import { buildProjectIndex } from "../project-index/build-index";
import { normalizeWorkspaceNavigation } from "./navigation";
import {
  detailForArtifact,
  detailForDiagnostic,
  detailForGap,
  detailForTarget,
  fallbackDetail
} from "./drilldowns";
import {
  buildTargetSummaries,
  buildWorkspaceProjectSummary,
  buildWorkspaceSummary
} from "./summaries";
import type {
  ArtifactExplorerRecord,
  BuildWorkspaceInput,
  DetailPanelRecord,
  TargetSummary,
  Workspace,
  WorkspaceSection
} from "./types";

function detailIdFor(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function dedupeArtifacts(records: readonly ArtifactExplorerRecord[]): readonly ArtifactExplorerRecord[] {
  const seen = new Set<string>();
  const unique: ArtifactExplorerRecord[] = [];

  for (const record of records) {
    const key = `${record.artifactKind}:${record.pathOrUrl}:${record.targetId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(record);
  }

  return unique;
}

function buildArtifactRecords(input: {
  readonly result: BuildWorkspaceInput["result"];
  readonly target?: TargetSummary;
}): readonly ArtifactExplorerRecord[] {
  if (input.target === undefined) {
    return [];
  }

  const target = input.target;
  const sourcePaths = new Set(
    target.sourceRefs
      .map((reference) => reference.path)
      .filter((path): path is string => path !== undefined)
  );
  const sourceReferenceRecords = target.sourceRefs.map((reference, index) => ({
    artifactId: detailIdFor("source", reference.path ?? reference.url ?? `${target.targetId}:${index}`),
    artifactKind: "source_reference" as const,
    label: reference.label ?? "Source reference",
    pathOrUrl: reference.path ?? reference.url ?? "unavailable",
    targetId: target.targetId,
    sourceType: target.sourceType,
    diagnosticState: "unverified" as const,
    linkedEvidenceIds: [],
    displaySafety:
      reference.url !== undefined ? "external-url" as const : reference.path === undefined ? "missing-reference" as const : "display-only" as const
  }));
  const discovered = (input.result?.artifacts ?? [])
    .filter((artifact) => sourcePaths.has(artifact.projectRelativePath))
    .map((artifact) => ({
      artifactId: detailIdFor("artifact", artifact.id),
      artifactKind: "discovered_artifact" as const,
      label: artifact.kind,
      pathOrUrl: artifact.projectRelativePath,
      targetId: target.targetId,
      sourceType: target.sourceType,
      diagnosticState: "unverified" as const,
      linkedEvidenceIds: [],
      displaySafety: "display-only" as const
    }));
  const evidenceView = buildEvidenceView({ result: input.result, targetId: target.targetId });
  const linked = evidenceView.expectationGroups.flatMap((group) =>
    group.rows.flatMap((row) =>
      row.artifacts.map((artifact) => ({
        artifactId: detailIdFor("linked", artifact.artifactId),
        artifactKind: "linked_evidence_artifact" as const,
        label: artifact.label,
        pathOrUrl: artifact.pathOrUrl,
        targetId: target.targetId,
        sourceType: target.sourceType,
        diagnosticState: artifact.availability === "unavailable" ? "warning" as const : "unverified" as const,
        linkedEvidenceIds: row.evidenceId === undefined ? [] : [row.evidenceId],
        displaySafety: artifact.kind === "external_url" ? "external-url" as const : "display-only" as const
      }))
    )
  );

  return dedupeArtifacts([...sourceReferenceRecords, ...discovered, ...linked]);
}

function buildSections(input: {
  readonly result: BuildWorkspaceInput["result"];
  readonly target?: TargetSummary;
  readonly artifactRecords: readonly ArtifactExplorerRecord[];
}): readonly WorkspaceSection[] {
  if (input.target === undefined) {
    return [];
  }

  const owner = buildOwnerView({ result: input.result, targetId: input.target.targetId });
  const evidence = buildEvidenceView({ result: input.result, targetId: input.target.targetId });
  const gaps = buildGapTriage({ result: input.result, targetId: input.target.targetId });
  const analytics = buildAnalyticsView({ result: input.result, targetId: input.target.targetId });

  return [
    {
      sectionId: "overview",
      title: "Checks",
      badgeCount: owner.expectations.length,
      availability: owner.expectations.length === 0 ? "empty" : "available",
      emptyState: "No quality checks are available for this feature."
    },
    {
      sectionId: "evidence",
      title: "Evidence",
      badgeCount: evidence.canonicalEvidence.length,
      availability: evidence.canonicalEvidence.length === 0 ? "empty" : "available",
      emptyState: "No evidence relationships are available for this feature."
    },
    {
      sectionId: "gaps",
      title: "Gaps",
      badgeCount: gaps.records.length,
      availability: gaps.records.length === 0 ? "empty" : "available",
      emptyState: "No evidence gaps are available for this feature."
    },
    {
      sectionId: "analytics",
      title: "Release",
      badgeCount: analytics.metrics.length,
      availability: analytics.metrics.length === 0 ? "empty" : "available",
      emptyState: "No release-confidence analytics are available for this feature."
    },
    {
      sectionId: "artifacts",
      title: "Artifacts",
      badgeCount: input.artifactRecords.length,
      availability: input.artifactRecords.length === 0 ? "empty" : "available",
      emptyState: "No artifact references are available for this feature."
    }
  ];
}

function buildDetailRecord(input: {
  readonly workspace: Omit<Workspace, "detailRecord">;
}): DetailPanelRecord | undefined {
  const detailKind = input.workspace.navigation.selectedDetailKind;
  const detailId = input.workspace.navigation.selectedDetailId;
  const target = input.workspace.selectedTarget;

  if (detailKind === undefined || detailId === undefined) {
    return undefined;
  }

  if (detailKind === "target" && target !== undefined && detailId === target.targetId) {
    return detailForTarget(target);
  }

  if (detailKind === "artifact") {
    const artifact = input.workspace.artifactRecords.find((record) => record.artifactId === detailId);
    return artifact === undefined ? fallbackDetail({ kind: detailKind, id: detailId, target }) : detailForArtifact(artifact);
  }

  if (detailKind === "diagnostic") {
    const diagnostic = input.workspace.diagnostics.find((record) => record.id === detailId);
    return diagnostic === undefined
      ? fallbackDetail({ kind: detailKind, id: detailId, target })
      : detailForDiagnostic(diagnostic, target);
  }

  if (detailKind === "gap") {
    if (target === undefined) {
      return fallbackDetail({ kind: detailKind, id: detailId, target });
    }

    const gap = buildGapTriage({
      result: input.workspace.result,
      targetId: target.targetId,
      selectedGapId: detailId
    }).selectedGap;

    return gap === undefined
      ? fallbackDetail({ kind: detailKind, id: detailId, target })
      : detailForGap(gap, target);
  }

  return fallbackDetail({ kind: detailKind, id: detailId, target });
}

export function buildWorkspace(input: BuildWorkspaceInput): Workspace {
  const index = buildProjectIndex({
    result: input.result,
    isLoading: input.isLoading
  });
  const targets = buildTargetSummaries(input.result, index);
  const projectSummary = buildWorkspaceProjectSummary({
    result: input.result,
    targets
  });
  const navigation = normalizeWorkspaceNavigation({
    navigation: input.navigation,
    targets
  });
  const selectedTarget =
    navigation.selectedTargetId === undefined
      ? undefined
      : targets.find((target) => target.targetId === navigation.selectedTargetId);
  const artifactRecords = buildArtifactRecords({
    result: input.result,
    target: selectedTarget
  });
  const workspaceWithoutDetail = {
    state: index.state,
    result: input.result,
    summary: buildWorkspaceSummary(input.result, index, targets),
    ...(projectSummary === undefined ? {} : { projectSummary }),
    targets,
    navigation,
    selectedTarget,
    sections: buildSections({
      result: input.result,
      target: selectedTarget,
      artifactRecords
    }),
    artifactRecords,
    diagnostics: index.diagnostics.details
  } satisfies Omit<Workspace, "detailRecord">;

  return {
    ...workspaceWithoutDetail,
    detailRecord: buildDetailRecord({ workspace: workspaceWithoutDetail })
  };
}
