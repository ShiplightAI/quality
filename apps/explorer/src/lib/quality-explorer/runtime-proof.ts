export interface RuntimeProofStatusInput {
  readonly executionStatus: string;
  readonly resolutionStatus: string;
  readonly observationCount: number;
}

export interface RuntimeExecutionViewLike {
  readonly execution: {
    readonly status: string;
    readonly observations: readonly unknown[];
  };
  readonly resolution: {
    readonly status: string;
  };
}

export interface RuntimeProfileExecutionLike {
  readonly execution: {
    readonly status: string;
    readonly observations: readonly unknown[];
  };
}

export function hasUsableRuntimeProofStatus(input: RuntimeProofStatusInput): boolean {
  return (
    input.executionStatus !== "invalid" &&
    input.resolutionStatus !== "invalid" &&
    input.observationCount > 0
  );
}

export function hasLoadedRuntimeProof(
  execution: RuntimeExecutionViewLike | undefined
): boolean {
  if (execution === undefined) {
    return false;
  }

  return hasUsableRuntimeProofStatus({
    executionStatus: execution.execution.status,
    resolutionStatus: execution.resolution.status,
    observationCount: execution.execution.observations.length
  });
}

export function hasLoadedProfileRuntimeProof(
  execution: RuntimeProfileExecutionLike | undefined
): boolean {
  if (execution === undefined) {
    return false;
  }

  return execution.execution.status !== "invalid" && execution.execution.observations.length > 0;
}
