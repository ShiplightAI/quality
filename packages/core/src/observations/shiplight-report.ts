import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import { INTERNAL_OBSERVATION_CONTEXT } from "./types";
import type {
  ObservationBatchInput,
  ObservationEvidenceRefInput,
  ObservationRecordInput,
  ObservationRecordStatus,
  ObservationRevisionInput,
  ObservationSourceInput
} from "./types";
import { isoTimestamp, normalizePath, stringValue } from "./ingest-helpers";

/**
 * Reads the report a Shiplight YAML run writes next to the suite
 * (`shiplight-report/report-data.json`).
 *
 * It exists because a YAML suite's results are not otherwise readable without
 * asking the producer to add a second reporter: the run transpiles to Playwright
 * and then writes THIS file, and a repo that has it usually has no Playwright
 * JSON at all.
 */

interface ShiplightReportTest {
  readonly file?: string;
  readonly title?: string;
  readonly baseTitle?: string;
  readonly status?: string;
  readonly startTime?: string;
  readonly endTime?: string;
}

interface ShiplightReport {
  readonly tests?: readonly ShiplightReportTest[];
  readonly timestamp?: string;
}

// The same vocabulary Playwright uses, because the run is a Playwright run.
function mapStatus(value: string | undefined): ObservationRecordStatus | undefined {
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

/**
 * Maps a reported spec path back to the YAML it was generated from.
 *
 * The runner reports the TRANSPILED file, but that file is a build artifact —
 * gitignored, absent from a fresh checkout, and regenerated on every run. The
 * source is the `.test.yaml`, and that is what a quality map can honestly pin,
 * so it is what the observation must be keyed on. Pinning the generated spec
 * instead would point a check at a file no reviewer has.
 *
 * This inverts the transpiler's own rule, which names the output by replacing
 * the source suffix: `yamlPath.replace(/\.test\.yaml$/, '.yaml.spec.ts')`.
 *
 * Deliberately confined to this adapter rather than applied to Playwright
 * reports generally: a plain Playwright project may contain a hand-written file
 * genuinely called `foo.yaml.spec.ts`, and rewriting that would corrupt an
 * honest identity. Here the convention is the format's own.
 */
export function shiplightSourcePath(reported: string): string {
  return reported.endsWith(".yaml.spec.ts")
    ? `${reported.slice(0, -".yaml.spec.ts".length)}.test.yaml`
    : reported;
}

export interface BuildShiplightObservationBatchInput {
  readonly report_json: string;
  readonly source?: ObservationSourceInput;
  readonly revision?: ObservationRevisionInput;
  readonly evidence_refs?: readonly ObservationEvidenceRefInput[];
}

export function buildShiplightObservationBatch(input: BuildShiplightObservationBatchInput): {
  readonly batch?: ObservationBatchInput;
  readonly diagnostics: readonly ScanDiagnostic[];
} {
  const diagnostics: ScanDiagnostic[] = [];
  const invalid = (message: string): ScanDiagnostic =>
    createDiagnostic({ severity: "error", code: "INVALID_OBSERVATION_ARTIFACT", message });

  let parsed: ShiplightReport;
  try {
    parsed = JSON.parse(input.report_json) as ShiplightReport;
  } catch (error) {
    return {
      diagnostics: [
        invalid(
          `Shiplight report could not be parsed: ${error instanceof Error ? error.message : String(error)}`
        )
      ]
    };
  }

  if (!Array.isArray(parsed.tests)) {
    return { diagnostics: [invalid("Shiplight report is missing a tests array.")] };
  }

  const reportObservedAt = isoTimestamp(parsed.timestamp);
  const observations: ObservationRecordInput[] = [];

  parsed.tests.forEach((test, index) => {
    const reported = normalizePath(stringValue(test.file));
    const status = mapStatus(stringValue(test.status));
    if (reported === undefined || status === undefined) {
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "INVALID_OBSERVATION_RECORD",
          message: `Shiplight report test ${index} has no usable file or status and was skipped.`
        })
      );
      return;
    }

    // `baseTitle` is the YAML test's own name; `title` is that name with the
    // run's tags prefixed. A quality map is authored against the YAML, so the
    // bare name is the identity a human would pin — and the tagged form would
    // not match it, since tags are prefixed rather than joined by the suite
    // separator the resolver folds on.
    const testCase = stringValue(test.baseTitle) ?? stringValue(test.title);
    const observedAt = isoTimestamp(test.endTime) ?? isoTimestamp(test.startTime) ?? reportObservedAt;

    observations.push({
      observation_id: ["shiplight-report", reported, testCase ?? "test", index].join(":"),
      test_file: shiplightSourcePath(reported),
      ...(testCase === undefined ? {} : { test_case: testCase }),
      status,
      ...(observedAt === undefined ? {} : { observed_at: observedAt }),
      revision: input.revision,
      evidence_refs: input.evidence_refs ?? []
    });
  });

  if (observations.length === 0) {
    return {
      diagnostics: [...diagnostics, invalid("Shiplight report contained no usable test results.")]
    };
  }

  return {
    batch: {
      source: input.source,
      context: INTERNAL_OBSERVATION_CONTEXT,
      observations
    },
    diagnostics
  };
}
