import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import { INTERNAL_OBSERVATION_CONTEXT } from "./types";
import type {
  IngestObservationManifestInput,
  ObservationIngestionResult,
  ObservationRecordInput,
  ObservationRecordStatus,
  QualityObservationManifest,
  QualityObservationManifestParseResult,
  QualityObservationManifestRecord,
  QualityObservationManifestRevision,
  QualityObservationManifestRun
} from "./types";
import { isoTimestamp, normalizeArtifact, normalizePath, statusFor, stringValue } from "./ingest-helpers";
import { normalizeObservationBatches } from "./normalize";

export const QUALITY_OBSERVATION_SCHEMA_VERSION = 1 as const;

export function buildQualityObservationManifestJsonSchema(): Record<string, unknown> {
  const nonEmptyString = { type: "string", minLength: 1 };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://shiplight.dev/schemas/quality/quality-observations.schema.json",
    title: "Quality Observations",
    type: "object",
    additionalProperties: false,
    required: ["schema_version", "revision", "observed_at", "observations"],
    properties: {
      schema_version: { const: QUALITY_OBSERVATION_SCHEMA_VERSION },
      revision: {
        type: "object",
        additionalProperties: false,
        required: ["commit"],
        properties: {
          commit: nonEmptyString,
          branch: nonEmptyString,
          dirty: { type: "boolean" }
        }
      },
      run: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: nonEmptyString,
          url: nonEmptyString
        }
      },
      observed_at: {
        type: "string",
        format: "date-time"
      },
      observations: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        "x-unique-by": ["path", "test_case"],
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "status"],
          properties: {
            path: nonEmptyString,
            test_case: nonEmptyString,
            status: {
              enum: ["pass", "fail", "error", "skipped"]
            },
            observed_at: {
              type: "string",
              format: "date-time"
            },
            note: nonEmptyString
          }
        }
      }
    }
  };
}

export function serializeQualityObservationManifestJsonSchema(): string {
  return `${JSON.stringify(buildQualityObservationManifestJsonSchema(), null, 2)}\n`;
}

const MANIFEST_KEYS = new Set(["schema_version", "revision", "run", "observed_at", "observations"]);
const REVISION_KEYS = new Set(["commit", "branch", "dirty"]);
const RUN_KEYS = new Set(["id", "url"]);
const OBSERVATION_KEYS = new Set(["path", "test_case", "status", "observed_at", "note"]);
const STATUSES = new Set<ObservationRecordStatus>(["pass", "fail", "error", "skipped"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diagnostic(
  message: string,
  code: ScanDiagnostic["code"] = "INVALID_OBSERVATION_ARTIFACT",
  severity: ScanDiagnostic["severity"] = "error"
): ScanDiagnostic {
  return createDiagnostic({
    severity,
    code,
    message
  });
}

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): readonly string[] {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function parseRevision(value: unknown, diagnostics: ScanDiagnostic[]): QualityObservationManifestRevision | undefined {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("Quality observations revision must be an object with a non-empty commit."));
    return undefined;
  }

  const extras = unknownKeys(value, REVISION_KEYS);
  if (extras.length > 0) {
    diagnostics.push(diagnostic(`Quality observations revision contains unknown fields: ${extras.join(", ")}.`));
  }

  const commit = stringValue(value.commit);
  if (commit === undefined) {
    diagnostics.push(diagnostic("Quality observations revision.commit is required."));
    return undefined;
  }

  if (value.branch !== undefined && stringValue(value.branch) === undefined) {
    diagnostics.push(diagnostic("Quality observations revision.branch must be a non-empty string when provided."));
  }
  if (value.dirty !== undefined && typeof value.dirty !== "boolean") {
    diagnostics.push(diagnostic("Quality observations revision.dirty must be a boolean when provided."));
  }

  return {
    commit,
    ...(stringValue(value.branch) === undefined ? {} : { branch: stringValue(value.branch) }),
    ...(typeof value.dirty === "boolean" ? { dirty: value.dirty } : {})
  };
}

function parseRun(value: unknown, diagnostics: ScanDiagnostic[]): QualityObservationManifestRun | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("Quality observations run must be an object when provided."));
    return undefined;
  }

  const extras = unknownKeys(value, RUN_KEYS);
  if (extras.length > 0) {
    diagnostics.push(diagnostic(`Quality observations run contains unknown fields: ${extras.join(", ")}.`));
  }

  const id = stringValue(value.id);
  if (id === undefined) {
    diagnostics.push(diagnostic("Quality observations run.id is required when run is provided."));
    return undefined;
  }
  if (value.url !== undefined && stringValue(value.url) === undefined) {
    diagnostics.push(diagnostic("Quality observations run.url must be a non-empty string when provided."));
  }

  return {
    id,
    ...(stringValue(value.url) === undefined ? {} : { url: stringValue(value.url) })
  };
}

function parseStatus(value: unknown): ObservationRecordStatus | undefined {
  return typeof value === "string" && STATUSES.has(value as ObservationRecordStatus)
    ? (value as ObservationRecordStatus)
    : undefined;
}

function observationKey(record: QualityObservationManifestRecord): string {
  return `${record.path.replaceAll("\\", "/")}::${record.test_case?.trim().toLowerCase() ?? ""}`;
}

type ObservationEntryMode = "strict" | "tolerant";

function parseObservations(
  value: unknown,
  fallbackObservedAt: string | undefined,
  diagnostics: ScanDiagnostic[],
  mode: ObservationEntryMode
): readonly QualityObservationManifestRecord[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic("Quality observations must define an observations array."));
    return undefined;
  }

  const observations: QualityObservationManifestRecord[] = [];
  const seenKeys = new Set<string>();
  const entryDiagnostic = (
    message: string,
    code: ScanDiagnostic["code"] = "INVALID_OBSERVATION_ARTIFACT"
  ): ScanDiagnostic => diagnostic(message, code, mode === "tolerant" ? "warning" : "error");

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      diagnostics.push(entryDiagnostic(`Quality observations entry ${index} must be an object and was skipped.`));
      return;
    }

    const extras = unknownKeys(entry, OBSERVATION_KEYS);
    if (extras.length > 0) {
      diagnostics.push(
        entryDiagnostic(
          `Quality observations entry ${index} contains unknown fields and was skipped: ${extras.join(", ")}.`
        )
      );
      return;
    }

    const path = normalizePath(stringValue(entry.path));
    const status = parseStatus(entry.status);
    const observedAt = entry.observed_at === undefined ? undefined : isoTimestamp(entry.observed_at);
    const testCase = stringValue(entry.test_case);
    const note = stringValue(entry.note);

    const invalidFields = [
      path === undefined ? "path" : undefined,
      status === undefined ? "status (pass, fail, error, or skipped)" : undefined,
      entry.observed_at !== undefined && observedAt === undefined ? "observed_at" : undefined,
      entry.test_case !== undefined && testCase === undefined ? "test_case" : undefined,
      entry.note !== undefined && note === undefined ? "note" : undefined
    ].filter((field): field is string => field !== undefined);

    if (invalidFields.length > 0) {
      diagnostics.push(
        entryDiagnostic(
          `Quality observations entry ${index} is missing or invalid and was skipped: ${invalidFields.join(", ")}.`
        )
      );
      return;
    }

    if (path === undefined || status === undefined) {
      return;
    }

    if (observedAt === undefined && fallbackObservedAt === undefined) {
      diagnostics.push(
        entryDiagnostic(`Quality observations entry ${index} has no valid observation time and was skipped.`)
      );
      return;
    }

    const record: QualityObservationManifestRecord = {
      path,
      ...(testCase === undefined ? {} : { test_case: testCase }),
      status,
      ...(observedAt === undefined ? {} : { observed_at: observedAt }),
      ...(note === undefined ? {} : { note })
    };
    const key = observationKey(record);
    if (seenKeys.has(key)) {
      diagnostics.push(
        entryDiagnostic(
          `Quality observations contains duplicate path/test_case identity ${path}${testCase === undefined ? "" : ` :: ${testCase}`}.`,
          "DUPLICATE_OBSERVATION_KEY"
        )
      );
      return;
    }

    seenKeys.add(key);
    observations.push(record);
  });

  if (observations.length === 0) {
    diagnostics.push(diagnostic("Quality observations did not contain any usable records."));
    return undefined;
  }

  return observations;
}

function parseManifestDocument(
  reportJson: string,
  entryMode: ObservationEntryMode
): {
  readonly document?: QualityObservationManifest;
  readonly diagnostics: readonly ScanDiagnostic[];
} {
  const diagnostics: ScanDiagnostic[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(reportJson);
  } catch (error) {
    return {
      diagnostics: [
        diagnostic(
          `Quality observations JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`
        )
      ]
    };
  }

  if (!isRecord(parsed)) {
    return {
      diagnostics: [
        diagnostic(
          "Quality observations must be a versioned JSON object with schema_version, revision, observed_at, and observations."
        )
      ]
    };
  }

  const extras = unknownKeys(parsed, MANIFEST_KEYS);
  if (extras.length > 0) {
    diagnostics.push(diagnostic(`Quality observations contains unknown fields: ${extras.join(", ")}.`));
  }

  if (parsed.schema_version !== QUALITY_OBSERVATION_SCHEMA_VERSION) {
    diagnostics.push(diagnostic(`Quality observations schema_version must be ${QUALITY_OBSERVATION_SCHEMA_VERSION}.`));
  }

  const missingEnvelope = [
    parsed.revision === undefined ? "revision" : undefined,
    parsed.observed_at === undefined ? "observed_at" : undefined,
    parsed.observations === undefined ? "observations" : undefined
  ].filter((field): field is string => field !== undefined);
  if (missingEnvelope.length > 0) {
    diagnostics.push(diagnostic(`Quality observations is missing required fields: ${missingEnvelope.join(", ")}.`));
  }

  const revision = parseRevision(parsed.revision, diagnostics);
  const run = parseRun(parsed.run, diagnostics);
  const observedAt = isoTimestamp(parsed.observed_at);
  if (parsed.observed_at !== undefined && observedAt === undefined) {
    diagnostics.push(diagnostic("Quality observations observed_at must be a valid timestamp."));
  }
  const observations = parseObservations(parsed.observations, observedAt, diagnostics, entryMode);

  if (
    diagnostics.some((entry) => entry.severity === "error") ||
    parsed.schema_version !== QUALITY_OBSERVATION_SCHEMA_VERSION ||
    revision === undefined ||
    observedAt === undefined ||
    observations === undefined
  ) {
    return {
      diagnostics
    };
  }

  return {
    document: {
      schema_version: QUALITY_OBSERVATION_SCHEMA_VERSION,
      revision,
      ...(run === undefined ? {} : { run }),
      observed_at: observedAt,
      observations
    },
    diagnostics
  };
}

export function parseQualityObservationManifest(reportJson: string): QualityObservationManifestParseResult {
  const parsed = parseManifestDocument(reportJson, "strict");
  if (parsed.document === undefined) {
    return {
      status: "invalid",
      diagnostics: parsed.diagnostics
    };
  }

  return {
    status: "valid",
    document: parsed.document,
    diagnostics: parsed.diagnostics
  };
}

export function serializeQualityObservationManifest(manifest: QualityObservationManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function observationIdFor(
  input: IngestObservationManifestInput,
  manifest: QualityObservationManifest,
  entry: QualityObservationManifestRecord
): string {
  return [
    "quality-observations",
    manifest.run?.id ?? manifest.revision.commit,
    input.artifact?.path ?? input.artifact?.url ?? "artifact",
    entry.path,
    entry.test_case ?? "file"
  ].join(":");
}

export function ingestObservationManifest(input: IngestObservationManifestInput): ObservationIngestionResult {
  const parsed = parseManifestDocument(input.report_json, "tolerant");
  if (parsed.document === undefined) {
    return {
      status: "invalid",
      observations: [],
      diagnostics: parsed.diagnostics
    };
  }

  const manifest = parsed.document;
  const artifact = normalizeArtifact(input.artifact, "quality-observations");
  const source = {
    ...input.source,
    run_id: manifest.run?.id ?? input.source?.run_id,
    run_url: manifest.run?.url ?? input.source?.run_url
  };
  const observations: ObservationRecordInput[] = manifest.observations.map((entry) => ({
    observation_id: observationIdFor(input, manifest, entry),
    test_file: entry.path,
    test_case: entry.test_case,
    status: entry.status,
    observed_at: entry.observed_at ?? manifest.observed_at,
    revision: input.revision ?? { ...manifest.revision },
    note: entry.note,
    artifacts: artifact === undefined ? [] : [artifact]
  }));

  const normalized = normalizeObservationBatches([
    {
      source,
      context: INTERNAL_OBSERVATION_CONTEXT,
      observations
    }
  ]);
  const diagnostics = [...normalized.diagnostics, ...parsed.diagnostics];

  return {
    status: statusFor(normalized.observations.length, diagnostics.length),
    observations: normalized.observations,
    diagnostics
  };
}
