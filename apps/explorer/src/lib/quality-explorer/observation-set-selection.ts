interface ObservationSetSelectionState {
  readonly branch: string;
  readonly commit: string;
  readonly profileRunIds: Readonly<Record<string, string>>;
}

interface ObservationSetRouteSelection {
  readonly branch?: string;
  readonly commit?: string;
  readonly profiles?: readonly {
    readonly profileId: string;
    readonly runId?: number;
    readonly branch?: string;
    readonly commit?: string;
  }[];
}

export function serializeObservationSetSelection(
  selection: ObservationSetSelectionState
): ObservationSetRouteSelection | undefined {
  const branch = selection.branch.trim();
  const commit = selection.commit.trim();
  const profiles = Object.entries(selection.profileRunIds)
    .map(([profileId, runIdValue]) => ({
      profileId,
      runId: Number.parseInt(runIdValue, 10)
    }))
    .filter((entry) => Number.isInteger(entry.runId) && entry.runId !== undefined && entry.runId > 0);

  if (branch.length === 0 && commit.length === 0 && profiles.length === 0) {
    return undefined;
  }

  return {
    ...(branch.length === 0 ? {} : { branch }),
    ...(commit.length === 0 ? {} : { commit }),
    ...(profiles.length === 0 ? {} : { profiles })
  };
}
