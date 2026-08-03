import type {
  NormalizedEvidenceEntry,
  NormalizedExpectation,
  NormalizedQualityGraph
} from "@shiplightai/quality-map";
import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ScanResult } from "../discovery/types";
import type {
  ObservationResolutionAuditRow,
  NormalizedObservationRecord,
  ObservationIngestionResult,
  ObservationResolutionResult,
  ResolvedObservationRecord
} from "./types";

interface ProofSourceEntry {
  readonly graph: NormalizedQualityGraph;
  readonly expectation: NormalizedExpectation;
  readonly evidence: NormalizedEvidenceEntry;
  readonly normalizedPath: string;
  readonly baseName: string;
  readonly testCase?: string;
}

function normalizePath(value: string | undefined): string | undefined {
  return value?.replaceAll("\\", "/");
}

function baseName(value: string): string {
  const segments = value.split("/");
  return segments[segments.length - 1] ?? value;
}

function pathMatches(actual: string, candidate: string): boolean {
  return (
    actual === candidate ||
    actual.endsWith(`/${candidate}`) ||
    candidate.endsWith(`/${actual}`)
  );
}

// Check names are authored in product language, not as strict identifiers, so
// the test_case join is case-insensitive and whitespace-trimmed.
function normalizeCase(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

// Evidence without a test_case pin stays file-level (case-agnostic), preserving
// existing behavior. A pinned entry only matches an observation that names that
// same case.
function caseMatches(pin: string | undefined, observed: string | undefined): boolean {
  const normalizedPin = normalizeCase(pin);
  if (normalizedPin === undefined) {
    return true;
  }

  return normalizedPin === normalizeCase(observed);
}

// Distinctness for ambiguity detection is keyed on (path, casePin) so several
// pinned checks sharing one workflow file are treated as separate evidence,
// while unpinned entries on the same path remain a single file-level proof.
function matchKey(entry: ProofSourceEntry): string {
  const pin = normalizeCase(entry.testCase);
  return pin === undefined ? entry.normalizedPath : `${entry.normalizedPath}::${pin}`;
}

function distinctMatchKeys(entries: readonly ProofSourceEntry[]): readonly string[] {
  return [...new Set(entries.map(matchKey))];
}

function proofSourceEntries(result: ScanResult): readonly ProofSourceEntry[] {
  const entries: ProofSourceEntry[] = [];

  for (const qualityMap of result.qualityMaps.results) {
    const graph = qualityMap.graph;
    if (graph === undefined) {
      continue;
    }

    const expectations = new Map(
      graph.expectations.map((expectation) => [expectation.normalizedId, expectation] as const)
    );

    for (const evidence of graph.evidence) {
      const normalizedEvidencePath = normalizePath(evidence.path);
      if (normalizedEvidencePath === undefined) {
        continue;
      }

      const expectation = expectations.get(evidence.expectationId);
      if (expectation === undefined) {
        continue;
      }

      entries.push({
        graph,
        expectation,
        evidence,
        normalizedPath: normalizedEvidencePath,
        baseName: baseName(normalizedEvidencePath),
        testCase: evidence.testCase
      });
    }
  }

  return entries;
}

function statusFor(
  observations: readonly ResolvedObservationRecord[],
  diagnosticsCount: number
): ObservationResolutionResult["status"] {
  if (observations.length === 0 && diagnosticsCount > 0) {
    return "invalid";
  }

  return diagnosticsCount > 0 ? "partial" : "valid";
}

function distinctPaths(entries: readonly ProofSourceEntry[]): readonly string[] {
  return [...new Set(entries.map((entry) => entry.normalizedPath))];
}

function resolvedRecordsFor(
  record: NormalizedObservationRecord,
  entries: readonly ProofSourceEntry[]
): readonly ResolvedObservationRecord[] {
  return entries.map((entry) => ({
    ...record,
    subjectId: entry.graph.target.normalizedId,
    expectationId: entry.expectation.normalizedId,
    evidenceId: entry.evidence.normalizedId,
    subjectLocalId: entry.graph.target.localId,
    expectationLocalId: entry.expectation.localId,
    evidenceLocalId: entry.evidence.localId
  }));
}

function auditRowBase(record: NormalizedObservationRecord): Omit<
  ObservationResolutionAuditRow,
  | "matchStatus"
  | "targetId"
  | "targetLocalId"
  | "targetName"
  | "expectationId"
  | "expectationLocalId"
  | "evidenceId"
  | "evidenceLocalId"
  | "evidencePath"
> {
  return {
    observationId: record.observationId,
    testFile: record.testFile,
    testCase: record.testCase,
    testClass: record.testClass,
    testProject: record.testProject,
    context: record.context,
    status: record.status,
    observedAt: record.observedAt,
    sourceId: record.source.id,
    sourceKind: record.source.kind,
    sourceLabel: record.source.label,
    runId: record.source.runId,
    runUrl: record.source.runUrl
  };
}

function matchedAuditRows(
  record: NormalizedObservationRecord,
  entries: readonly ProofSourceEntry[]
): readonly ObservationResolutionAuditRow[] {
  return entries.map((entry) => ({
    ...auditRowBase(record),
    matchStatus: "matched",
    targetId: entry.graph.target.normalizedId,
    targetLocalId: entry.graph.target.localId,
    targetName: entry.graph.target.name,
    expectationId: entry.expectation.normalizedId,
    expectationLocalId: entry.expectation.localId,
    evidenceId: entry.evidence.normalizedId,
    evidenceLocalId: entry.evidence.localId,
    evidencePath: entry.evidence.path
  }));
}

function unmatchedAuditRow(
  record: NormalizedObservationRecord,
  matchStatus: "unmatched" | "ambiguous"
): ObservationResolutionAuditRow {
  return {
    ...auditRowBase(record),
    matchStatus
  };
}

function matchesForTestFile(
  record: NormalizedObservationRecord,
  entries: readonly ProofSourceEntry[]
): {
  readonly kind: "matched" | "unknown" | "ambiguous";
  readonly entries: readonly ProofSourceEntry[];
  readonly label: string;
} {
  const normalizedTestFile = normalizePath(record.testFile);
  if (normalizedTestFile === undefined) {
    return {
      kind: "unknown",
      entries: [],
      label: record.testClass ?? "unknown test file"
    };
  }

  const matches = entries.filter(
    (entry) =>
      pathMatches(entry.normalizedPath, normalizedTestFile) &&
      caseMatches(entry.testCase, record.testCase)
  );
  const matchedKeys = distinctMatchKeys(matches);
  if (matchedKeys.length === 0) {
    return {
      kind: "unknown",
      entries: [],
      label: normalizedTestFile
    };
  }

  if (matchedKeys.length > 1) {
    return {
      kind: "ambiguous",
      entries: [],
      label: normalizedTestFile
    };
  }

  return {
    kind: "matched",
    entries: matches,
    label: normalizedTestFile
  };
}

function matchesForTestClass(
  record: NormalizedObservationRecord,
  entries: readonly ProofSourceEntry[]
): {
  readonly kind: "matched" | "unknown" | "ambiguous";
  readonly entries: readonly ProofSourceEntry[];
  readonly label: string;
} {
  const normalizedClass = normalizePath(record.testClass);
  if (normalizedClass === undefined) {
    return {
      kind: "unknown",
      entries: [],
      label: "unknown test class"
    };
  }

  const matches = entries.filter((entry) => entry.baseName === normalizedClass);
  const matchedPaths = distinctPaths(matches);
  if (matchedPaths.length === 0) {
    return {
      kind: "unknown",
      entries: [],
      label: normalizedClass
    };
  }

  if (matchedPaths.length > 1) {
    return {
      kind: "ambiguous",
      entries: [],
      label: normalizedClass
    };
  }

  return {
    kind: "matched",
    entries: matches,
    label: normalizedClass
  };
}

export function resolveObservations(
  result: ScanResult,
  observations: ObservationIngestionResult
): ObservationResolutionResult {
  const diagnostics = [...observations.diagnostics];
  const resolved: ResolvedObservationRecord[] = [];
  const auditRows: ObservationResolutionAuditRow[] = [];
  const entries = proofSourceEntries(result);

  observations.observations.forEach((record) => {
    const match =
      record.testFile !== undefined
        ? matchesForTestFile(record, entries)
        : matchesForTestClass(record, entries);

    if (match.kind === "unknown") {
      auditRows.push(unmatchedAuditRow(record, "unmatched"));
      return;
    }

    if (match.kind === "ambiguous") {
      auditRows.push(unmatchedAuditRow(record, "ambiguous"));
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "AMBIGUOUS_OBSERVATION_PROOF_SOURCE",
          message: `Observation ${record.observationId} references proof source ${match.label}, which matches more than one structured evidence path.`
        })
      );
      return;
    }

    auditRows.push(...matchedAuditRows(record, match.entries));
    resolved.push(...resolvedRecordsFor(record, match.entries));
  });

  return {
    status: statusFor(resolved, diagnostics.length),
    observations: resolved,
    auditRows,
    diagnostics
  };
}
