import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import type {
  NormalizedObservationArtifact,
  NormalizedObservationRecord,
  NormalizedObservationRevision,
  NormalizedObservationSource,
  ObservationArtifactInput,
  ObservationBatchInput,
  ObservationIngestionResult,
  ObservationRecordInput,
  ObservationRecordStatus,
  ObservationRevisionInput,
  ObservationSourceInput
} from "./types";

const validStatuses = new Set<ObservationRecordStatus>(["pass", "fail", "error", "skipped"]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isoTimestamp(value: unknown): string | undefined {
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

function normalizeSource(value: ObservationSourceInput | undefined): NormalizedObservationSource {
  return {
    id: stringValue(value?.id),
    kind: stringValue(value?.kind),
    label: stringValue(value?.label),
    runId: stringValue(value?.run_id),
    runUrl: stringValue(value?.run_url)
  };
}

function normalizeRevision(value: ObservationRevisionInput | undefined): NormalizedObservationRevision {
  return {
    commit: stringValue(value?.commit),
    branch: stringValue(value?.branch),
    dirty: value?.dirty === true
  };
}

function mergeRevision(
  base: NormalizedObservationRevision,
  override: NormalizedObservationRevision
): NormalizedObservationRevision {
  return {
    commit: override.commit ?? base.commit,
    branch: override.branch ?? base.branch,
    dirty: base.dirty || override.dirty
  };
}

function normalizeArtifacts(value: readonly ObservationArtifactInput[] | undefined): readonly NormalizedObservationArtifact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((artifact) => ({
    kind: stringValue(artifact.kind),
    path: stringValue(artifact.path),
    url: stringValue(artifact.url),
    label: stringValue(artifact.label)
  }));
}

function normalizeStatus(value: unknown): ObservationRecordStatus | undefined {
  const normalized = stringValue(value)?.toLowerCase() as ObservationRecordStatus | undefined;
  return normalized !== undefined && validStatuses.has(normalized) ? normalized : undefined;
}

function statusFor(records: readonly NormalizedObservationRecord[], diagnosticsCount: number): ObservationIngestionResult["status"] {
  if (records.length === 0 && diagnosticsCount > 0) {
    return "invalid";
  }

  return diagnosticsCount > 0 ? "partial" : "valid";
}

function fallbackObservationId(source: NormalizedObservationSource, batchIndex: number, recordIndex: number): string {
  return `${source.id ?? source.label ?? source.kind ?? "observation-source"}:${batchIndex}:${recordIndex}`;
}

export function normalizeObservationBatches(
  inputs: readonly ObservationBatchInput[]
): ObservationIngestionResult {
  const diagnostics: ScanDiagnostic[] = [];
  const records: NormalizedObservationRecord[] = [];
  const seenObservationIds = new Set<string>();

  inputs.forEach((batch, batchIndex) => {
    const source = normalizeSource(batch.source);
    const defaultContext = stringValue(batch.context);
    const defaultObservedAt = isoTimestamp(batch.observed_at);
    const defaultRevision = normalizeRevision(batch.revision);

    if (batch.observed_at !== undefined && defaultObservedAt === undefined) {
      diagnostics.push(
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_BATCH",
          message: `Observation batch ${batchIndex} has an invalid observed_at timestamp.`
        })
      );
    }

    if (batch.observations === undefined) {
      diagnostics.push(
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_BATCH",
          message: `Observation batch ${batchIndex} is missing an observations array.`
        })
      );
      return;
    }

    if (!Array.isArray(batch.observations)) {
      diagnostics.push(
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_BATCH",
          message: `Observation batch ${batchIndex} observations must be an array.`
        })
      );
      return;
    }

    batch.observations.forEach((record: ObservationRecordInput, recordIndex) => {
      const observationId = stringValue(record.observation_id) ?? fallbackObservationId(source, batchIndex, recordIndex);
      const testFile = stringValue(record.test_file)?.replaceAll("\\", "/");
      const testCase = stringValue(record.test_case);
      const testClass = stringValue(record.test_class);
      const testProject = stringValue(record.test_project);
      const context = stringValue(record.context) ?? defaultContext;
      const status = normalizeStatus(record.status);
      const observedAt = isoTimestamp(record.observed_at) ?? defaultObservedAt;
      const revision = mergeRevision(defaultRevision, normalizeRevision(record.revision));

      if (seenObservationIds.has(observationId)) {
        diagnostics.push(
          createDiagnostic({
            severity: "error",
            code: "DUPLICATE_OBSERVATION_ID",
            message: `Observation ${observationId} was supplied more than once.`
          })
        );
        return;
      }

      seenObservationIds.add(observationId);

      const missingFields = [
        testFile === undefined && testClass === undefined ? "test_file or test_class" : undefined,
        context === undefined ? "context" : undefined,
        status === undefined ? "status" : undefined,
        observedAt === undefined ? "observed_at" : undefined
      ].filter((value): value is string => value !== undefined);

      if (missingFields.length > 0) {
        diagnostics.push(
          createDiagnostic({
            severity: "error",
            code: "INVALID_OBSERVATION_RECORD",
            message: `Observation ${observationId} is missing or invalid required fields: ${missingFields.join(", ")}.`
          })
        );
        return;
      }

      if (record.observed_at !== undefined && isoTimestamp(record.observed_at) === undefined) {
        diagnostics.push(
          createDiagnostic({
            severity: "error",
            code: "INVALID_OBSERVATION_RECORD",
            message: `Observation ${observationId} has an invalid observed_at timestamp.`
          })
        );
        return;
      }

      if (
        (testFile === undefined && testClass === undefined) ||
        context === undefined ||
        status === undefined ||
        observedAt === undefined
      ) {
        return;
      }

      records.push({
        observationId,
        testFile,
        testCase,
        testClass,
        testProject,
        context,
        status,
        observedAt,
        revision,
        source,
        note: stringValue(record.note),
        artifacts: normalizeArtifacts(record.artifacts)
      });
    });
  });

  return {
    status: statusFor(records, diagnostics.length),
    observations: records,
    diagnostics
  };
}
