export interface ObservationProfilePresentationInput {
  readonly transport?: string;
  readonly hasExecution?: boolean;
  readonly selectedRunId?: string | number;
  readonly selectedRunUrl?: string;
}

export interface ObservationProfilePresentation {
  readonly showEnvStatus: boolean;
  readonly showRunIdInput: boolean;
  readonly showRunValue: boolean;
  readonly runValueLabel?: string;
  readonly runValue?: string;
  readonly showRunLink: boolean;
}

export function buildObservationProfilePresentation(
  input: ObservationProfilePresentationInput
): ObservationProfilePresentation {
  const hasExecution =
    input.hasExecution === true || input.selectedRunId !== undefined || input.selectedRunUrl !== undefined;

  if (hasExecution) {
    return {
      showEnvStatus: false,
      showRunIdInput: false,
      showRunValue: true,
      runValueLabel: input.selectedRunId === undefined ? "Source" : "Run id",
      runValue: input.selectedRunId === undefined ? "local bundle" : String(input.selectedRunId),
      showRunLink: input.selectedRunUrl !== undefined
    };
  }

  return {
    showEnvStatus: true,
    showRunIdInput: input.transport === "github-actions",
    showRunValue: false,
    showRunLink: false
  };
}
