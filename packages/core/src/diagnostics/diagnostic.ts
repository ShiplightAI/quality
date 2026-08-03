export const diagnosticSeverities = ["error", "warning", "info"] as const;

export type DiagnosticSeverity = (typeof diagnosticSeverities)[number];

export const diagnosticCodes = [
  "EMPTY_PATH",
  "MISSING_PATH",
  "NON_LOCAL_PATH",
  "NON_DIRECTORY_TARGET",
  "UNREADABLE_DIRECTORY",
  "UNREADABLE_ARTIFACT_FILE",
  "OUT_OF_PROJECT_ARTIFACT",
  "DUPLICATE_ARTIFACT_MATCH",
  "NO_ARTIFACTS_FOUND",
  "PARTIAL_SCAN",
  "FAILED_REFRESH",
  "SCAN_FAILED",
  "TARGET_SOURCE_CLASSIFICATION_CHANGED",
  "INVALID_OBSERVATION_BATCH",
  "INVALID_OBSERVATION_RECORD",
  "DUPLICATE_OBSERVATION_ID",
  "INVALID_OBSERVATION_SOURCE",
  "MISSING_OBSERVATION_SOURCE_ENV",
  "INVALID_OBSERVATION_ARTIFACT",
  "DUPLICATE_OBSERVATION_KEY",
  "MISSING_OBSERVATION_SOURCE_STEP",
  "MISSING_OBSERVATION_ARTIFACT_MATCH",
  "AMBIGUOUS_OBSERVATION_ARTIFACT_MATCH",
  "AMBIGUOUS_OBSERVATION_SOURCE_STEP",
  "UNSUPPORTED_OBSERVATION_SOURCE_STATUS",
  "UNKNOWN_OBSERVATION_SET_PROFILE",
  "INVALID_SAVED_VIEW",
  "UNKNOWN_SAVED_VIEW_FEATURE",
  "INVALID_PROJECT_SOURCE",
  "INVALID_FEATURE_EDIT",
  "INVALID_QUALITY_MAP_EDIT",
  "INVALID_OBSERVATION_SET_EDIT",
  "INVALID_OBSERVATION_SOURCE_EDIT",
  "UNKNOWN_OBSERVATION_SUBJECT",
  "AMBIGUOUS_OBSERVATION_SUBJECT",
  "UNKNOWN_OBSERVATION_EVIDENCE",
  "OBSERVATION_EXPECTATION_MISMATCH",
  "UNKNOWN_OBSERVATION_PROOF_SOURCE",
  "AMBIGUOUS_OBSERVATION_PROOF_SOURCE",
  "INVALID_OBSERVATION_SELECTION",
  "MISSING_EVIDENCE_FILE"
] as const;

export type DiagnosticCode = (typeof diagnosticCodes)[number];

export interface ScanDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly affectedPath?: string;
  readonly details?: string;
}

export function createDiagnostic(input: ScanDiagnostic): ScanDiagnostic {
  return input;
}

export function hasBlockingDiagnostic(diagnostics: readonly ScanDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function hasWarningDiagnostic(diagnostics: readonly ScanDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "warning");
}
