import type { NormalizedExpectation, NormalizedQualityGraph } from "@shiplightai/quality-map";
import type { ScanResult } from "../discovery/types";
import type {
  ObservationContextQualityRollup,
  ObservedState,
  TargetEvaluationSnapshot
} from "./types";
import { priorityWeight } from "../quality-structure/priority";

function expectationWeight(expectation: NormalizedExpectation): number {
  return priorityWeight(expectation.priority);
}

function qualityPoints(state: ObservedState): number {
  switch (state) {
    case "pass":
      return 1;
    case "partial":
      return 0.7;
    default:
      return 0;
  }
}

function graphByTargetId(result: ScanResult): ReadonlyMap<string, NormalizedQualityGraph> {
  return new Map(
    result.qualityMaps.results.flatMap((entry) =>
      entry.graph === undefined ? [] : [[entry.graph.target.normalizedId, entry.graph] as const]
    )
  );
}

function expectationById(graph: NormalizedQualityGraph): ReadonlyMap<string, NormalizedExpectation> {
  return new Map(graph.expectations.map((expectation) => [expectation.normalizedId, expectation] as const));
}

export function buildObservationContextQualityRollups(input: {
  readonly result: ScanResult;
  readonly groups: readonly {
    readonly targets: readonly TargetEvaluationSnapshot[];
  }[];
}): readonly ObservationContextQualityRollup[] {
  const graphs = graphByTargetId(input.result);

  return input.groups.map((group) => {
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
      const expectations = expectationById(graph);

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
    } satisfies ObservationContextQualityRollup;
  });
}
