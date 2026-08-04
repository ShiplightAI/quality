import type { ScanResult } from "@shiplightai/quality-core";
// Subpath, not the @shiplightai/quality-core barrel: barrel -> observation-sources -> adm-zip -> fs (client-bundle fatal).
import { priorityWeight } from "@shiplightai/quality-core/priority";
import type { ObservationRuntimeExecutionView } from "../components/ObservationSourcePanel";

function expectationWeight(expectation: {
  readonly priority?: string;
}): number {
  return priorityWeight(expectation.priority);
}

function qualityPoints(state: string): number {
  switch (state) {
    case "pass":
      return 1;
    case "partial":
      return 0.7;
    default:
      return 0;
  }
}

function buildFilteredRollups(
  result: ScanResult,
  evaluations: ObservationRuntimeExecutionView["evaluations"]
): ObservationRuntimeExecutionView["rollups"] {
  const graphs = new Map(
    result.qualityMaps.results.flatMap((entry) =>
      entry.graph === undefined ? [] : [[entry.graph.target.normalizedId, entry.graph] as const]
    )
  );

  return evaluations.map((group) => {
    let totalWeight = 0;
    let weightedQuality = 0;
    let evaluatedExpectationCount = 0;
    let evaluatedTargetCount = 0;

    for (const target of group.targets) {
      if (target.state !== "available" || target.targetId === undefined) {
        continue;
      }

      const graph = graphs.get(target.targetId);
      if (graph === undefined) {
        continue;
      }

      evaluatedTargetCount += 1;
      const expectations = new Map(graph.expectations.map((expectation) => [expectation.normalizedId, expectation] as const));

      for (const evaluatedExpectation of target.expectations) {
        const expectation = expectations.get(evaluatedExpectation.expectationId);
        if (expectation === undefined) {
          continue;
        }

        const weight = expectationWeight(expectation);
        totalWeight += weight;
        weightedQuality += weight * qualityPoints(evaluatedExpectation.observedState);
        evaluatedExpectationCount += 1;
      }
    }

    const qualityScore = totalWeight === 0 ? undefined : Math.round((weightedQuality / totalWeight) * 100);

    return {
      qualityScore,
      evaluatedTargetCount,
      evaluatedExpectationCount,
      basis:
        qualityScore === undefined
          ? "No evaluated expectations were available for this observation run."
          : `Runtime quality score derived from ${evaluatedExpectationCount} evaluated expectation${evaluatedExpectationCount === 1 ? "" : "s"} across ${evaluatedTargetCount} target${evaluatedTargetCount === 1 ? "" : "s"}.`
    };
  });
}

export function filterRuntimeExecutionForResult(
  execution: ObservationRuntimeExecutionView | undefined,
  result: ScanResult | undefined
): ObservationRuntimeExecutionView | undefined {
  if (execution === undefined || result === undefined) {
    return execution;
  }

  const allowedTargetIds = new Set(
    result.qualityMaps.results.flatMap((entry) =>
      entry.graph === undefined ? [] : [entry.graph.target.normalizedId]
    )
  );

  const evaluations = execution.evaluations
    .map((group) => ({
      targets: group.targets.filter((target) => target.targetId !== undefined && allowedTargetIds.has(target.targetId))
    }))
    .filter((group) => group.targets.length > 0);
  const auditRows = execution.resolution.auditRows.filter(
    (row) => row.targetId === undefined || allowedTargetIds.has(row.targetId)
  );

  return {
    ...execution,
    resolution: {
      ...execution.resolution,
      auditRows
    },
    evaluations,
    rollups: buildFilteredRollups(result, evaluations)
  };
}
