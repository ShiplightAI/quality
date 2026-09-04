import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import { INTERNAL_OBSERVATION_CONTEXT } from "./types";
import type {
  IngestPlaywrightJsonReportInput,
  ObservationBatchInput,
  ObservationIngestionResult,
  ObservationRecordInput,
  ObservationRecordStatus
} from "./types";
import { countProblems, isoTimestamp, normalizeArtifact, normalizePath, statusFor, stringValue } from "./ingest-helpers";
import { normalizeObservationBatches } from "./normalize";

interface ParsedPlaywrightCase {
  readonly title: string;
  readonly file?: string;
  readonly projectName?: string;
  readonly status: ObservationRecordStatus;
  readonly observedAt?: string;
}

interface PlaywrightJsonResult {
  readonly status?: string;
  readonly startTime?: string;
  readonly duration?: number;
}

interface PlaywrightJsonTest {
  readonly projectName?: string;
  readonly results?: readonly PlaywrightJsonResult[];
}

interface PlaywrightJsonSpec {
  readonly title?: string;
  readonly file?: string;
  readonly tests?: readonly PlaywrightJsonTest[];
}

interface PlaywrightJsonSuite {
  readonly file?: string;
  readonly specs?: readonly PlaywrightJsonSpec[];
  readonly suites?: readonly PlaywrightJsonSuite[];
}

interface PlaywrightJsonReport {
  readonly suites?: readonly PlaywrightJsonSuite[];
  readonly stats?: {
    readonly startTime?: string;
    readonly duration?: number;
  };
}

function mapResultStatus(value: string | undefined): ObservationRecordStatus | undefined {
  switch (value) {
    case "passed":
      return "pass";
    case "failed":
      return "fail";
    case "timedOut":
    case "interrupted":
      return "error";
    case "skipped":
      return "skipped";
    default:
      return undefined;
  }
}

function observedAtForResult(
  result: PlaywrightJsonResult | undefined,
  fallback: string | undefined
): string | undefined {
  const startTime = isoTimestamp(result?.startTime);
  if (startTime === undefined) {
    return fallback;
  }

  const duration = typeof result?.duration === "number" ? result.duration : 0;
  return new Date(Date.parse(startTime) + duration).toISOString();
}

function flattenCases(
  suite: PlaywrightJsonSuite,
  reportFallbackObservedAt: string | undefined,
  output: ParsedPlaywrightCase[]
): void {
  for (const spec of suite.specs ?? []) {
    const title = stringValue(spec.title);
    if (title === undefined) {
      continue;
    }

    for (const test of spec.tests ?? []) {
      const results = Array.isArray(test.results) ? test.results : [];
      const finalResult = results[results.length - 1];
      const status = mapResultStatus(stringValue(finalResult?.status));
      if (status === undefined) {
        continue;
      }

      output.push({
        title,
        file: stringValue(spec.file) ?? stringValue(suite.file),
        projectName: stringValue(test.projectName),
        status,
        observedAt: observedAtForResult(finalResult, reportFallbackObservedAt)
      });
    }
  }

  for (const child of suite.suites ?? []) {
    flattenCases(child, reportFallbackObservedAt, output);
  }
}

function observationIdFor(
  input: IngestPlaywrightJsonReportInput,
  testCase: ParsedPlaywrightCase,
  index: number
): string {
  return [
    "playwright-json",
    input.source?.run_id ?? input.source?.run_url ?? input.artifact?.path ?? input.artifact?.url ?? "artifact",
    normalizePath(testCase.file) ?? testCase.projectName ?? "unknown-test-file",
    testCase.title,
    index
  ].join(":");
}

// Parses the report into a canonical batch WITHOUT normalizing it. Split out so
// a host transport can read a Playwright report and still hand the engine the
// same un-normalized input a file-based transport would — there is no second,
// softer path into a score.
export function buildPlaywrightObservationBatch(input: IngestPlaywrightJsonReportInput): {
  readonly batch?: ObservationBatchInput;
  readonly diagnostics: readonly ScanDiagnostic[];
} {
  const diagnostics: ScanDiagnostic[] = [];
  let parsed: PlaywrightJsonReport;

  try {
    parsed = JSON.parse(input.report_json) as PlaywrightJsonReport;
  } catch (error) {
    diagnostics.push(
      createDiagnostic({
        severity: "error",
        code: "INVALID_OBSERVATION_ARTIFACT",
        message: `Playwright JSON observation artifact could not be parsed: ${error instanceof Error ? error.message : String(error)}`
      })
    );

    return { diagnostics };
  }

  if (!Array.isArray(parsed.suites)) {
    diagnostics.push(
      createDiagnostic({
        severity: "error",
        code: "INVALID_OBSERVATION_ARTIFACT",
        message: "Playwright JSON observation artifact is missing a suites array."
      })
    );

    return { diagnostics };
  }

  const reportFallbackObservedAt =
    isoTimestamp(input.observed_at) ??
    (() => {
      const start = isoTimestamp(parsed.stats?.startTime);
      const duration = typeof parsed.stats?.duration === "number" ? parsed.stats.duration : undefined;
      if (start === undefined || duration === undefined) {
        return undefined;
      }

      return new Date(Date.parse(start) + duration).toISOString();
    })();

  const testCases: ParsedPlaywrightCase[] = [];
  for (const suite of parsed.suites) {
    flattenCases(suite, reportFallbackObservedAt, testCases);
  }

  if (testCases.length === 0) {
    diagnostics.push(
      createDiagnostic({
        severity: "error",
        code: "INVALID_OBSERVATION_ARTIFACT",
        message: "Playwright JSON observation artifact did not contain any runnable test cases."
      })
    );

    return { diagnostics };
  }

  const artifact = normalizeArtifact(input.artifact, "playwright-json");
  const observations: ObservationRecordInput[] = [];

  testCases.forEach((testCase, index) => {
    observations.push({
      observation_id: observationIdFor(input, testCase, index),
      test_file: normalizePath(testCase.file),
      test_project: testCase.projectName,
      test_case: testCase.title,
      status: testCase.status,
      observed_at: testCase.observedAt ?? reportFallbackObservedAt,
      revision: input.revision,
      artifacts: artifact === undefined ? [] : [artifact]
    });
  });

  return {
    batch: {
      source: input.source,
      context: INTERNAL_OBSERVATION_CONTEXT,
      observations
    },
    diagnostics
  };
}

export function ingestPlaywrightJsonReport(
  input: IngestPlaywrightJsonReportInput
): ObservationIngestionResult {
  const built = buildPlaywrightObservationBatch(input);
  if (built.batch === undefined) {
    return { status: "invalid", observations: [], diagnostics: built.diagnostics };
  }

  const normalized = normalizeObservationBatches([built.batch]);
  const mergedDiagnostics = [...normalized.diagnostics, ...built.diagnostics];

  return {
    status: statusFor(normalized.observations.length, countProblems(mergedDiagnostics)),
    observations: normalized.observations,
    diagnostics: mergedDiagnostics
  };
}
