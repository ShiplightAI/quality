import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ObservationIngestionResult } from "./types";

function statusFor(
  observationCount: number,
  diagnosticsCount: number
): ObservationIngestionResult["status"] {
  if (observationCount === 0 && diagnosticsCount > 0) {
    return "invalid";
  }

  return diagnosticsCount > 0 ? "partial" : "valid";
}

export function mergeObservationIngestionResults(
  inputs: readonly ObservationIngestionResult[]
): ObservationIngestionResult {
  const diagnostics = inputs.flatMap((input) => input.diagnostics);
  const observations = [];
  const seenObservationIds = new Set<string>();

  for (const input of inputs) {
    for (const observation of input.observations) {
      if (seenObservationIds.has(observation.observationId)) {
        diagnostics.push(
          createDiagnostic({
            severity: "error",
            code: "DUPLICATE_OBSERVATION_ID",
            message: `Observation ${observation.observationId} was supplied more than once.`
          })
        );
        continue;
      }

      seenObservationIds.add(observation.observationId);
      observations.push(observation);
    }
  }

  return {
    status: statusFor(observations.length, diagnostics.length),
    observations,
    diagnostics
  };
}
