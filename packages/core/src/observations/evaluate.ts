import { deriveExpectationAssessment, evidenceForExpectation, isFeatureConfirmed, structureLevel } from "../quality-structure/assessment";
import { createDiagnostic } from "../diagnostics/diagnostic";
import type {
  BuildTargetEvaluationInput,
  EvaluatedEvidenceObservation,
  EvaluatedExpectationSnapshot,
  ObservationRecordStatus,
  ObservationStateCounts,
  ObservedState,
  ResolvedObservationRecord,
  TargetEvaluationSnapshot
} from "./types";

function emptyCounts(): ObservationStateCounts {
  return {
    pass: 0,
    fail: 0,
    error: 0,
    skipped: 0,
    partial: 0,
    unobserved: 0
  };
}

function isoTimestamp(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

function compareByObservedAtDesc(left: ResolvedObservationRecord, right: ResolvedObservationRecord): number {
  const leftTime = Date.parse(left.observedAt);
  const rightTime = Date.parse(right.observedAt);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.observationId.localeCompare(right.observationId);
}

function selectObservation(
  records: readonly ResolvedObservationRecord[],
  input: BuildTargetEvaluationInput
): ResolvedObservationRecord | undefined {
  const asOf = isoTimestamp(input.selection.asOf);
  const filtered = records.filter((record) => {
    if (input.selection.commit !== undefined && record.revision.commit !== input.selection.commit) {
      return false;
    }
    if (asOf !== undefined && Date.parse(record.observedAt) > Date.parse(asOf)) {
      return false;
    }
    return true;
  });

  return [...filtered].sort(compareByObservedAtDesc)[0];
}

function evidenceState(record: ResolvedObservationRecord | undefined): ObservationRecordStatus | "unobserved" {
  return record?.status ?? "unobserved";
}

function latestObservedAt(evidence: readonly EvaluatedEvidenceObservation[]): string | undefined {
  const timestamps = evidence
    .map((entry) => entry.observedAt)
    .filter((value): value is string => value !== undefined)
    .sort((left, right) => Date.parse(right) - Date.parse(left));

  return timestamps[0];
}

function expectationObservedState(
  evidence: readonly EvaluatedEvidenceObservation[]
): ObservedState {
  const states = evidence.map((entry) => entry.state);

  if (states.includes("fail")) {
    return "fail";
  }
  if (states.includes("error")) {
    return "error";
  }
  if (states.length === 0 || states.every((state) => state === "unobserved")) {
    return "unobserved";
  }
  if (states.every((state) => state === "pass")) {
    return "pass";
  }
  if (states.every((state) => state === "skipped")) {
    return "skipped";
  }
  return "partial";
}

function increment(counts: ObservationStateCounts, state: ObservedState): ObservationStateCounts {
  return {
    ...counts,
    [state]: counts[state] + 1
  };
}

function targetObservedState(expectations: readonly EvaluatedExpectationSnapshot[]): ObservedState {
  const states = expectations.map((expectation) => expectation.observedState);

  if (states.includes("fail")) {
    return "fail";
  }
  if (states.includes("error")) {
    return "error";
  }
  if (states.length === 0 || states.every((state) => state === "unobserved")) {
    return "unobserved";
  }
  if (states.every((state) => state === "pass")) {
    return "pass";
  }
  if (states.every((state) => state === "skipped")) {
    return "skipped";
  }
  return "partial";
}

export function buildTargetEvaluation(
  input: BuildTargetEvaluationInput
): TargetEvaluationSnapshot {
  const baseDiagnostics = [...input.observations.diagnostics];
  const result = input.result;

  if (result === undefined) {
    return {
      state: "missingTarget",
      displayName: "Unknown target",
      commit: input.selection.commit,
      evaluatedAt: new Date().toISOString(),
      observedState: "unobserved",
      counts: emptyCounts(),
      expectations: [],
      diagnostics: baseDiagnostics,
      missingSelection: {
        targetId: input.targetId,
        recoveryAction: "Scan a project before evaluating observation state."
      }
    };
  }

  const graph = result.qualityMaps.results
    .map((entry) => entry.graph)
    .find((entry) => entry?.target.normalizedId === input.targetId);

  if (graph === undefined) {
    return {
      state: "missingTarget",
      displayName: "Unknown target",
      commit: input.selection.commit,
      evaluatedAt: new Date().toISOString(),
      observedState: "unobserved",
      counts: emptyCounts(),
      expectations: [],
      diagnostics: [
        ...baseDiagnostics,
        createDiagnostic({
          severity: "warning",
          code: "INVALID_OBSERVATION_SELECTION",
          message: `Target ${input.targetId} is not present in the current structured scan result.`
        })
      ],
      missingSelection: {
        targetId: input.targetId,
        recoveryAction: "Choose a structured quality-map target before evaluating observations."
      }
    };
  }

  const selectionAsOf = isoTimestamp(input.selection.asOf);
  const diagnostics =
    input.selection.asOf !== undefined && selectionAsOf === undefined
      ? [
          ...baseDiagnostics,
          createDiagnostic({
            severity: "warning",
            code: "INVALID_OBSERVATION_SELECTION",
            message: `Observation selection asOf timestamp ${input.selection.asOf} is invalid and was ignored.`
          })
        ]
      : baseDiagnostics;

  const relevantObservations = input.observations.observations.filter(
    (record) => record.subjectId === graph.target.normalizedId
  );
  let counts = emptyCounts();

  // Reviewed (gate 2 confirmed AND gate 4 approved) lifts each check to HIGH
  // structure confidence; the provenance still reports its true origin.
  const feature = result.projectMaps.primary?.map?.features.find(
    (candidate) => candidate.artifacts.qualityMapPath === graph.source.projectRelativePath
  );
  const reviewed = isFeatureConfirmed(feature?.status) && graph.checksReviewed;

  const expectations = graph.expectations.map((expectation) => {
    const structural = deriveExpectationAssessment(graph, expectation);
    const evidence = evidenceForExpectation(graph, expectation).map((entry) => {
      const selected = selectObservation(
        relevantObservations.filter((record) => record.evidenceId === entry.normalizedId),
        input
      );

      return {
        evidenceId: entry.normalizedId,
        evidenceLocalId: entry.localId,
        state: evidenceState(selected),
        observationId: selected?.observationId,
        observedAt: selected?.observedAt,
        commit: selected?.revision.commit,
        runUrl: selected?.source.runUrl
      } satisfies EvaluatedEvidenceObservation;
    });

    const observedState = expectationObservedState(evidence);
    counts = increment(counts, observedState);

    return {
      expectationId: expectation.normalizedId,
      expectationLocalId: expectation.localId,
      title: expectation.title,
      structuralStatus: structural.status,
      evidenceConfidence: structural.evidenceConfidence,
      structureConfidence: structureLevel(structural.structureProvenance, reviewed),
      structureProvenance: structural.structureProvenance,
      observedState,
      latestObservedAt: latestObservedAt(evidence),
      evidence
    } satisfies EvaluatedExpectationSnapshot;
  });

  return {
    state: "available",
    targetId: graph.target.normalizedId,
    targetLocalId: graph.target.localId,
    displayName: graph.target.name,
    commit: input.selection.commit,
    evaluatedAt: new Date().toISOString(),
    observedState: targetObservedState(expectations),
    counts,
    expectations,
    diagnostics
  };
}
