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
  // Enclosing <testsuite name> chain, outermost first. node:test puts the
  // describe() title here and nowhere else, so this is often the only thing
  // that tells two same-named cases in one file apart.
  readonly suitePath: readonly string[];
  readonly file?: string;
  readonly className?: string;
  readonly status: ObservationRecordStatus;
}

// Matches the separator Playwright's own JUnit reporter writes into
// <testcase name>, so a qualified name reads the same whatever produced it.
const SUITE_SEPARATOR = " › ";

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

function collectCases(
  node: unknown,
  output: ParsedJunitCase[],
  suitePath: readonly string[] = []
): void {
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
      suitePath,
      file: stringValue(item["@_file"]),
      className: stringValue(item["@_classname"]),
      status: statusFromCase(item)
    });
  }

  for (const child of asArray(record.testsuite)) {
    const childName =
      child !== null && typeof child === "object"
        ? stringValue((child as Record<string, unknown>)["@_name"])
        : undefined;
    collectCases(child, output, childName === undefined ? suitePath : [...suitePath, childName]);
  }

  // <testsuites> is the document container, not a suite: its name is the report
  // name (`node:test`, `vitest tests`), never a describe() title, so it never
  // joins the suite path.
  for (const child of asArray(record.testsuites)) {
    collectCases(child, output, suitePath);
  }
}

function caseIdentity(testCase: ParsedJunitCase): string {
  return `${normalizePath(testCase.file) ?? testCase.className ?? ""}::${testCase.name}`;
}

function qualifiedName(testCase: ParsedJunitCase): string {
  return testCase.suitePath.length === 0
    ? testCase.name
    : [...testCase.suitePath, testCase.name].join(SUITE_SEPARATOR);
}

// Only cases whose bare (path, name) identity repeats inside one report get the
// suite prefix. <testsuite name> is producer-specific — node:test writes the
// describe() title, vitest and jest-junit write the file path and already fold
// the describe chain into <testcase name> — so prefixing unconditionally would
// corrupt the common reporters and rewrite identities that were never ambiguous.
//
// A case keeps its bare name unless the prefix actually separates it from the
// cases it collided with. Colliding cases that share one <testsuite> (Playwright
// running a spec under several projects, or it.each titles that repeat) qualify
// to the same string, so prefixing them would splice the suite or file name into
// test_case without resolving anything. Those stay bare and reach the manifest
// layer as the genuine duplicates they are.
function testCaseNames(testCases: readonly ParsedJunitCase[]): readonly string[] {
  const identityCounts = new Map<string, number>();
  const qualifiedCounts = new Map<string, number>();
  for (const testCase of testCases) {
    const identity = caseIdentity(testCase);
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
    const qualified = `${identity}::${qualifiedName(testCase)}`;
    qualifiedCounts.set(qualified, (qualifiedCounts.get(qualified) ?? 0) + 1);
  }

  return testCases.map((testCase) => {
    const identity = caseIdentity(testCase);
    if ((identityCounts.get(identity) ?? 0) <= 1) {
      return testCase.name;
    }

    const qualified = qualifiedName(testCase);
    return (qualifiedCounts.get(`${identity}::${qualified}`) ?? 0) === 1 ? qualified : testCase.name;
  });
}

function observationIdFor(
  input: IngestJunitXmlReportInput,
  testCase: ParsedJunitCase,
  name: string,
  index: number
): string {
  return [
    "junit",
    input.source?.run_id ?? input.source?.run_url ?? input.artifact?.path ?? input.artifact?.url ?? "artifact",
    normalizePath(testCase.file) ?? testCase.className ?? "unknown-test-file",
    name,
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

  const names = testCaseNames(testCases);

  testCases.forEach((testCase, index) => {
    const name = names[index] ?? testCase.name;
    observations.push({
      observation_id: observationIdFor(input, testCase, name, index),
      test_file: normalizePath(testCase.file),
      test_class: testCase.className,
      test_case: name,
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
