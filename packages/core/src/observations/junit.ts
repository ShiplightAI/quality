import { XMLParser } from "fast-xml-parser";
import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import { INTERNAL_OBSERVATION_CONTEXT } from "./types";
import type {
  IngestJunitXmlReportInput,
  ObservationIngestionResult,
  ObservationRecordInput,
  ObservationRecordStatus
} from "./types";
import { isoTimestamp, normalizeArtifact, normalizePath, statusFor, stringValue } from "./ingest-helpers";
import { normalizeObservationBatches } from "./normalize";

interface ParsedJunitCase {
  readonly name: string;
  readonly file?: string;
  readonly className?: string;
  readonly status: ObservationRecordStatus;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false
});

function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value as T];
}

function statusFromCase(node: Record<string, unknown>): ObservationRecordStatus {
  if (node["@_status"] === "skipped" || node.skipped !== undefined) {
    return "skipped";
  }

  if (node.error !== undefined) {
    return "error";
  }

  if (node.failure !== undefined) {
    return "fail";
  }

  return "pass";
}

function collectCases(node: unknown, output: ParsedJunitCase[]): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  for (const testcase of asArray(record.testcase)) {
    if (testcase === null || typeof testcase !== "object") {
      continue;
    }

    const item = testcase as Record<string, unknown>;
    const name = stringValue(item["@_name"]);
    if (name === undefined) {
      continue;
    }

    output.push({
      name,
      file: stringValue(item["@_file"]),
      className: stringValue(item["@_classname"]),
      status: statusFromCase(item)
    });
  }

  for (const child of asArray(record.testsuite)) {
    collectCases(child, output);
  }

  for (const child of asArray(record.testsuites)) {
    collectCases(child, output);
  }
}

function observationIdFor(
  input: IngestJunitXmlReportInput,
  testCase: ParsedJunitCase,
  index: number
): string {
  return [
    "junit",
    input.source?.run_id ?? input.source?.run_url ?? input.artifact?.path ?? input.artifact?.url ?? "artifact",
    normalizePath(testCase.file) ?? testCase.className ?? "unknown-test-file",
    testCase.name,
    index
  ].join(":");
}

export function ingestJunitXmlReport(
  input: IngestJunitXmlReportInput
): ObservationIngestionResult {
  const diagnostics: ScanDiagnostic[] = [];
  const observedAt = isoTimestamp(input.observed_at);

  if (observedAt === undefined) {
    diagnostics.push(
      createDiagnostic({
        severity: "error",
        code: "INVALID_OBSERVATION_ARTIFACT",
        message: "JUnit observation ingestion requires a valid observed_at timestamp."
      })
    );

    return {
      status: "invalid",
      observations: [],
      diagnostics
    };
  }

  let parsed: unknown;
  try {
    parsed = parser.parse(input.report_xml);
  } catch (error) {
    diagnostics.push(
      createDiagnostic({
        severity: "error",
        code: "INVALID_OBSERVATION_ARTIFACT",
        message: `JUnit observation artifact could not be parsed: ${error instanceof Error ? error.message : String(error)}`
      })
    );

    return {
      status: "invalid",
      observations: [],
      diagnostics
    };
  }

  const testCases: ParsedJunitCase[] = [];
  collectCases(parsed, testCases);

  if (testCases.length === 0) {
    diagnostics.push(
      createDiagnostic({
        severity: "error",
        code: "INVALID_OBSERVATION_ARTIFACT",
        message: "JUnit observation artifact did not contain any test cases."
      })
    );

    return {
      status: "invalid",
      observations: [],
      diagnostics
    };
  }

  const artifact = normalizeArtifact(input.artifact, "junit-xml");
  const observations: ObservationRecordInput[] = [];

  testCases.forEach((testCase, index) => {
    observations.push({
      observation_id: observationIdFor(input, testCase, index),
      test_file: normalizePath(testCase.file),
      test_class: testCase.className,
      test_case: testCase.name,
      status: testCase.status,
      observed_at: observedAt,
      revision: input.revision,
      artifacts: artifact === undefined ? [] : [artifact]
    });
  });

  const normalized = normalizeObservationBatches([
    {
      source: input.source,
      context: INTERNAL_OBSERVATION_CONTEXT,
      observations
    }
  ]);
  const mergedDiagnostics = [...normalized.diagnostics, ...diagnostics];

  return {
    status: statusFor(normalized.observations.length, mergedDiagnostics.length),
    observations: normalized.observations,
    diagnostics: mergedDiagnostics
  };
}
