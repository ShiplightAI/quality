import type { ObservationSetExecutionSelection } from "@shiplightai/quality-core";

export interface OptionValue {
  readonly nextIndex: number;
  readonly value: string;
}

export function optionValue(argv: readonly string[], index: number, option: string): OptionValue {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }

  return {
    nextIndex: index + 1,
    value
  };
}

export function nonNegativeIntegerOption(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${option} must be a non-negative integer.`);
  }
  return parsed;
}

export function positiveIntegerOption(value: string, option: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer.`);
  }
  return parsed;
}

export function parseProfileRunSelection(value: string): NonNullable<ObservationSetExecutionSelection["profiles"]>[number] {
  const [profileId, runIdRaw] = value.split("=", 2);
  if (profileId === undefined || profileId.length === 0) {
    throw new Error("--profile-run must use <profile-id>=<positive-run-id>.");
  }

  return {
    profileId,
    runId: positiveIntegerOption(runIdRaw ?? "", "--profile-run")
  };
}

export function singlePositionalPath(positional: readonly string[], fallback: string): string {
  if (positional.length > 1) {
    throw new Error("Only one project path can be provided.");
  }
  return positional[0] ?? fallback;
}
