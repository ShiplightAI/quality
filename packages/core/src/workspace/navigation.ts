import type {
  TargetSummary,
  WorkspaceNavigationState,
  WorkspaceSectionId
} from "./types";

export const workspaceSections: readonly WorkspaceSectionId[] = [
  "overview",
  "evidence",
  "gaps",
  "analytics",
  "artifacts"
];

function normalizeSection(section: WorkspaceSectionId | undefined): WorkspaceSectionId {
  return section === undefined || !workspaceSections.includes(section) ? "overview" : section;
}

function exactlyMatchesRequestedTarget(target: TargetSummary, requestedTargetId: string): boolean {
  return target.targetId === requestedTargetId;
}

function hasRequestedFeatureKey(target: TargetSummary, requestedTargetId: string): boolean {
  return target.featureKey === requestedTargetId;
}

function hasRequestedTargetSuffix(target: TargetSummary, requestedTargetId: string): boolean {
  return target.targetId.endsWith(`#target:${requestedTargetId}`);
}

function findRequestedTarget(
  targets: readonly TargetSummary[],
  requestedTargetId: string | undefined
): TargetSummary | undefined {
  if (requestedTargetId === undefined) {
    return undefined;
  }

  return (
    targets.find((target) => exactlyMatchesRequestedTarget(target, requestedTargetId)) ??
    targets.find((target) => hasRequestedFeatureKey(target, requestedTargetId)) ??
    targets.find((target) => hasRequestedTargetSuffix(target, requestedTargetId))
  );
}

export function normalizeWorkspaceNavigation(input: {
  readonly navigation?: Partial<WorkspaceNavigationState>;
  readonly targets: readonly TargetSummary[];
}): WorkspaceNavigationState {
  const requestedTargetId = input.navigation?.selectedTargetId;
  const selectedTarget = findRequestedTarget(input.targets, requestedTargetId);

  if (requestedTargetId !== undefined && selectedTarget === undefined) {
    return {
      selectedSection: "overview",
      targetRemovedMessage: "The previously selected feature is no longer present after refresh."
    };
  }

  return {
    selectedTargetId: selectedTarget?.targetId,
    selectedSection: normalizeSection(input.navigation?.selectedSection),
    selectedDetailKind: input.navigation?.selectedDetailKind,
    selectedDetailId: input.navigation?.selectedDetailId
  };
}

export function selectWorkspaceTarget(
  targetId: string,
  current?: Partial<WorkspaceNavigationState>
): WorkspaceNavigationState {
  return {
    selectedTargetId: targetId,
    selectedSection: current?.selectedSection ?? "overview"
  };
}

export function selectWorkspaceSection(
  section: WorkspaceSectionId,
  current: WorkspaceNavigationState
): WorkspaceNavigationState {
  return {
    ...current,
    selectedSection: section,
    selectedDetailKind: undefined,
    selectedDetailId: undefined
  };
}

export function selectWorkspaceDetail(
  current: WorkspaceNavigationState,
  detail: Pick<WorkspaceNavigationState, "selectedDetailKind" | "selectedDetailId">
): WorkspaceNavigationState {
  return {
    ...current,
    ...detail
  };
}
