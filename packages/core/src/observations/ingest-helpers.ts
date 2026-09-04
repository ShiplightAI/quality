import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import type { ObservationArtifactInput, ObservationIngestionResult } from "./types";

// Shared helpers for the observation ingest adapters (junit, playwright-json,
// manifest). Kept in one place so timestamp/status/path normalization stays
// consistent across every adapter.

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function isoTimestamp(value: unknown): string | undefined {
  const candidate = stringValue(value);
  if (candidate === undefined) {
    return undefined;
  }

  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

// Counts only diagnostics that report something going wrong. An `info` note is
// context for the reader, not a degraded read, and the source-execution and
// resolution paths already exclude it — an adapter that counted it would make
// the status depend on which ingestion path ran rather than on the inputs.
export function countProblems(diagnostics: readonly ScanDiagnostic[]): number {
  return diagnostics.filter((entry) => entry.severity !== "info").length;
}

export function statusFor(
  observationCount: number,
  diagnosticsCount: number
): ObservationIngestionResult["status"] {
  if (observationCount === 0 && diagnosticsCount > 0) {
    return "invalid";
  }

  return diagnosticsCount > 0 ? "partial" : "valid";
}

export function normalizePath(value: string | undefined): string | undefined {
  return value?.replaceAll("\\", "/");
}

export function normalizeArtifact(
  input: ObservationArtifactInput | undefined,
  defaultKind: string
): ObservationArtifactInput | undefined {
  if (input === undefined) {
    return undefined;
  }

  return {
    kind: stringValue(input.kind) ?? defaultKind,
    path: stringValue(input.path),
    url: stringValue(input.url),
    label: stringValue(input.label)
  };
}
