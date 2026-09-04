import { createDiagnostic } from "../diagnostics/diagnostic";
import {
  executeObservationSourceProfile,
  type HostObservationTransportRegistry,
  type ObservationSourceExecutionSelection,
  type ObservationSourceProfile
} from "../observation-sources";
import { mergeObservationIngestionResults } from "../observations";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import type {
  ObservationSet,
  ObservationSetExecutionProfileResult,
  ObservationSetExecutionResult,
  ObservationSetExecutionSelection,
  ObservationSetProfileSelection
} from "./types";

interface ExecuteObservationSetInput {
  readonly observationSet: ObservationSet;
  readonly observationSourceProfiles: readonly ObservationSourceProfile[];
  readonly projectRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly selection?: ObservationSetExecutionSelection;
  readonly fetchImpl?: typeof fetch;
  readonly hostTransports?: HostObservationTransportRegistry;
}

function statusFor(
  observationCount: number,
  diagnosticsCount: number
): ObservationSetExecutionResult["status"] {
  if (observationCount === 0 && diagnosticsCount > 0) {
    return "invalid";
  }

  return diagnosticsCount > 0 ? "partial" : "valid";
}

function selectionOverrideMap(
  selection: ObservationSetExecutionSelection | undefined
): {
  readonly overrides: ReadonlyMap<string, ObservationSetProfileSelection>;
  readonly diagnostics: readonly ScanDiagnostic[];
} {
  const overrides = new Map<string, ObservationSetProfileSelection>();
  const diagnostics: ScanDiagnostic[] = [];

  selection?.profiles?.forEach((profileSelection) => {
    if (overrides.has(profileSelection.profileId)) {
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "INVALID_OBSERVATION_SELECTION",
          message: `Observation-set selection references profile ${profileSelection.profileId} more than once. The first override was used.`
        })
      );
      return;
    }

    overrides.set(profileSelection.profileId, profileSelection);
  });

  return {
    overrides,
    diagnostics
  };
}

function profileSelection(
  input: {
    readonly globalSelection?: ObservationSetExecutionSelection;
    readonly profileOverride?: ObservationSetProfileSelection;
  }
): ObservationSourceExecutionSelection | undefined {
  const runId = input.profileOverride?.runId;
  const branch = input.profileOverride?.branch ?? input.globalSelection?.branch;
  const commit = input.profileOverride?.commit ?? input.globalSelection?.commit;

  if (runId === undefined && branch === undefined && commit === undefined) {
    return undefined;
  }

  return {
    ...(runId === undefined ? {} : { runId }),
    ...(branch === undefined ? {} : { branch }),
    ...(commit === undefined ? {} : { commit })
  };
}

function resolvedCommit(input: {
  readonly selection?: ObservationSetExecutionSelection;
  readonly profileResults: readonly ObservationSetExecutionProfileResult[];
}): {
  readonly resolvedCommit?: string;
  readonly diagnostics: readonly ScanDiagnostic[];
} {
  const requestedCommit = input.selection?.commit;

  if (requestedCommit !== undefined) {
    return {
      resolvedCommit: requestedCommit,
      diagnostics: []
    };
  }

  const commits = [
    ...new Set(
      input.profileResults
        .map((profile) => profile.execution.selectedRun?.commit)
        .filter((commit): commit is string => commit !== undefined)
    )
  ];

  if (commits.length <= 1) {
    return {
      resolvedCommit: commits[0],
      diagnostics: []
    };
  }

  return {
    // TODO: Add explicit overlap-precedence handling when multiple profiles emit the same observation key.
    diagnostics: []
  };
}

export async function executeObservationSet(
  input: ExecuteObservationSetInput
): Promise<ObservationSetExecutionResult> {
  const selectionMap = selectionOverrideMap(input.selection);
  const diagnostics: ScanDiagnostic[] = [...selectionMap.diagnostics];
  const profileResults: ObservationSetExecutionProfileResult[] = [];

  for (const profileRef of input.observationSet.profiles) {
    const profile = input.observationSourceProfiles.find((entry) => entry.id === profileRef.profileId);

    if (profile === undefined) {
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "UNKNOWN_OBSERVATION_SET_PROFILE",
          message: `Observation set ${input.observationSet.id} references unknown observation source profile ${profileRef.profileId}.`
        })
      );
      continue;
    }

    const execution = await executeObservationSourceProfile({
      profile,
      projectRoot: input.projectRoot,
      env: input.env,
      fetchImpl: input.fetchImpl,
      hostTransports: input.hostTransports,
      selection: profileSelection({
        globalSelection: input.selection,
        profileOverride: selectionMap.overrides.get(profile.id)
      })
    });

    profileResults.push({
      profileId: profile.id,
      profileName: profile.name,
      execution
    });
  }

  const merged = mergeObservationIngestionResults(
    profileResults.map((profile) => ({
      status: profile.execution.status,
      observations: profile.execution.observations,
      diagnostics: profile.execution.diagnostics
    }))
  );
  const commitResolution = resolvedCommit({
    selection: input.selection,
    profileResults
  });
  const allDiagnostics = [...merged.diagnostics, ...diagnostics, ...commitResolution.diagnostics];

  return {
    setId: input.observationSet.id,
    setName: input.observationSet.name,
    // Same rule as a single source execution: info-severity notes are context,
    // not a partial read.
    status: statusFor(
      merged.observations.length,
      allDiagnostics.filter((entry) => entry.severity !== "info").length
    ),
    profiles: profileResults,
    observations: merged.observations,
    diagnostics: allDiagnostics,
    resolvedCommit: commitResolution.resolvedCommit
  };
}
