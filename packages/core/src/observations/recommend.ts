import { evidenceForExpectation } from "../quality-structure/assessment";
import { priorityWeight } from "../quality-structure/priority";
import type { ScanResult } from "../discovery/types";
import type {
  EvaluatedExpectationSnapshot,
  EvaluatedEvidenceObservation,
  ObservedState,
  TargetEvaluationSnapshot
} from "./types";
import type { NormalizedEvidenceEntry, NormalizedExpectation, NormalizedQualityGraph } from "@shiplightai/quality-map";

export interface RuntimeImprovementRecommendation {
  readonly id: string;
  readonly targetId: string;
  readonly targetName: string;
  readonly expectationId: string;
  readonly expectationLocalId: string;
  readonly expectationTitle: string;
  readonly qualityMapPath: string;
  readonly priority?: string;
  readonly priorityWeight: number;
  readonly observedState: ObservedState;
  readonly structuralStatus: string;
  readonly evidenceConfidence: string;
  readonly structureConfidence: string;
  readonly structureProvenance: string;
  readonly potentialLift: number;
  readonly projectedScore: number;
  readonly currentScore: number;
  readonly reason: string;
  readonly nextAction: string;
  readonly proofSourcePaths: readonly string[];
  readonly verificationCommands: readonly string[];
}

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

function uniqueStrings(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.length > 0))];
}

function evidenceById(
  expectation: EvaluatedExpectationSnapshot
): ReadonlyMap<string, EvaluatedEvidenceObservation> {
  return new Map(expectation.evidence.map((evidence) => [evidence.evidenceId, evidence] as const));
}

function affectedEvidenceEntries(input: {
  readonly evidenceEntries: readonly NormalizedEvidenceEntry[];
  readonly evaluatedExpectation: EvaluatedExpectationSnapshot;
}): readonly NormalizedEvidenceEntry[] {
  const evaluatedEvidence = evidenceById(input.evaluatedExpectation);
  const affected = input.evidenceEntries.filter((entry) => {
    const observed = evaluatedEvidence.get(entry.normalizedId);
    return observed === undefined || observed.state !== "pass";
  });

  return affected.length === 0 ? input.evidenceEntries : affected;
}

function observedStateRank(state: ObservedState): number {
  switch (state) {
    case "fail":
      return 0;
    case "error":
      return 1;
    case "unobserved":
      return 2;
    case "skipped":
      return 3;
    case "partial":
      return 4;
    default:
      return 5;
  }
}

function reasonFor(input: {
  readonly expectation: NormalizedExpectation;
  readonly evaluatedExpectation: EvaluatedExpectationSnapshot;
  readonly proofSourcePaths: readonly string[];
}): string {
  const proofSourceSummary =
    input.proofSourcePaths.length === 0
      ? "linked proof sources"
      : input.proofSourcePaths.length === 1
        ? input.proofSourcePaths[0]!
        : `${input.proofSourcePaths.length} linked proof sources`;

  switch (input.evaluatedExpectation.observedState) {
    case "fail":
      return `The current observation run loaded failing proof from ${proofSourceSummary} for this weighted quality check.`;
    case "error":
      return `The current observation run could not execute or ingest proof cleanly from ${proofSourceSummary} for this weighted quality check.`;
    case "partial":
      return `This weighted quality check only has partial runtime proof coverage from ${proofSourceSummary}.`;
    case "skipped":
      return `The current observation run reached ${proofSourceSummary}, but the linked proof was skipped.`;
    case "unobserved":
      return `This weighted quality check has no passing runtime proof loaded from ${proofSourceSummary}.`;
    default:
      return `Improve the linked runtime proof for this weighted quality check.`;
  }
}

function nextActionFor(input: {
  readonly expectation: NormalizedExpectation;
  readonly evaluatedExpectation: EvaluatedExpectationSnapshot;
  readonly verificationCommands: readonly string[];
  readonly proofSourcePaths: readonly string[];
}): string {
  const commands = input.verificationCommands;
  const proofSources = input.proofSourcePaths;
  const proofSourceSummary =
    proofSources.length === 0
      ? "the linked proof source"
      : proofSources.length === 1
        ? proofSources[0]!
        : `${proofSources.length} linked proof sources`;
  const rerunInstruction =
    commands.length === 0
      ? `rerun ${proofSourceSummary}`
      : commands.length === 1
        ? `rerun \`${commands[0]}\``
        : `rerun one of the linked verification commands such as \`${commands[0]}\``;
  const proofGapInstruction = input.expectation.proofGapNextStep?.trim();

  switch (input.evaluatedExpectation.observedState) {
    case "fail":
      return `Fix the failing behavior or test behind ${proofSourceSummary}, ${rerunInstruction}, and confirm every linked observation passes.`;
    case "error":
      return `Fix the broken proof pipeline behind ${proofSourceSummary}, ${rerunInstruction}, and confirm observations load cleanly.`;
    case "partial":
      return `Close the missing proof coverage for ${proofSourceSummary}, ${rerunInstruction}, and bring every linked evidence record to pass.`;
    case "skipped":
      return `Enable the skipped proof behind ${proofSourceSummary}, ${rerunInstruction}, and confirm the observation run records a pass.`;
    case "unobserved":
      return proofGapInstruction !== undefined && proofGapInstruction.length > 0
        ? `${proofGapInstruction} Then ${rerunInstruction} and confirm this quality check records a pass.`
        : `Make sure ${proofSourceSummary} actually runs in the selected observation set, ${rerunInstruction}, and confirm this quality check records a pass.`;
    default:
      return `Improve ${proofSourceSummary}, ${rerunInstruction}, and confirm this quality check records a pass.`;
  }
}

function flattenAvailableTargets(targets: readonly TargetEvaluationSnapshot[]): readonly TargetEvaluationSnapshot[] {
  return targets.filter((target) => target.state === "available" && target.targetId !== undefined);
}

export function buildRuntimeImprovementRecommendations(input: {
  readonly result: ScanResult;
  readonly targets: readonly TargetEvaluationSnapshot[];
  readonly limit?: number;
}): readonly RuntimeImprovementRecommendation[] {
  const availableTargets = flattenAvailableTargets(input.targets);
  if (availableTargets.length === 0) {
    return [];
  }

  const graphs = graphByTargetId(input.result);
  let totalWeight = 0;
  let weightedQuality = 0;
  const resolvedExpectations: Array<{
    readonly graph: NormalizedQualityGraph;
    readonly expectation: NormalizedExpectation;
    readonly target: TargetEvaluationSnapshot;
    readonly evaluatedExpectation: EvaluatedExpectationSnapshot;
    readonly weight: number;
  }> = [];

  for (const target of availableTargets) {
    const graph = graphs.get(target.targetId!);
    if (graph === undefined) {
      continue;
    }

    const expectations = expectationById(graph);
    for (const evaluatedExpectation of target.expectations) {
      const expectation = expectations.get(evaluatedExpectation.expectationId);
      if (expectation === undefined) {
        continue;
      }

      const weight = expectationWeight(expectation);
      totalWeight += weight;
      weightedQuality += weight * qualityPoints(evaluatedExpectation.observedState);
      resolvedExpectations.push({
        graph,
        expectation,
        target,
        evaluatedExpectation,
        weight
      });
    }
  }

  if (totalWeight === 0 || resolvedExpectations.length === 0) {
    return [];
  }

  const currentScore = Math.round((weightedQuality / totalWeight) * 100);

  const recommendations = resolvedExpectations
    .filter(({ evaluatedExpectation }) => evaluatedExpectation.observedState !== "pass")
    .map(({ graph, expectation, target, evaluatedExpectation, weight }) => {
      const evidenceEntries = evidenceForExpectation(graph, expectation);
      const affectedEvidence = affectedEvidenceEntries({
        evidenceEntries,
        evaluatedExpectation
      });
      const proofSourcePaths = uniqueStrings(affectedEvidence.map((entry) => entry.path));
      const verificationCommands = uniqueStrings(affectedEvidence.map((entry) => entry.command));
      const potentialLiftRaw = (weight * (1 - qualityPoints(evaluatedExpectation.observedState)) / totalWeight) * 100;
      const potentialLift = Math.round(potentialLiftRaw * 10) / 10;
      const projectedScore = Math.round(((weightedQuality + weight * (1 - qualityPoints(evaluatedExpectation.observedState))) / totalWeight) * 100);

      return {
        id: `${target.targetId}:${evaluatedExpectation.expectationId}`,
        targetId: target.targetId!,
        targetName: target.displayName,
        expectationId: evaluatedExpectation.expectationId,
        expectationLocalId: evaluatedExpectation.expectationLocalId,
        expectationTitle: evaluatedExpectation.title,
        qualityMapPath: graph.source.projectRelativePath,
        ...(expectation.priority === undefined ? {} : { priority: expectation.priority }),
        priorityWeight: weight,
        observedState: evaluatedExpectation.observedState,
        structuralStatus: evaluatedExpectation.structuralStatus,
        evidenceConfidence: evaluatedExpectation.evidenceConfidence,
        structureConfidence: evaluatedExpectation.structureConfidence,
        structureProvenance: evaluatedExpectation.structureProvenance,
        potentialLift,
        projectedScore,
        currentScore,
        reason: reasonFor({
          expectation,
          evaluatedExpectation,
          proofSourcePaths
        }),
        nextAction: nextActionFor({
          expectation,
          evaluatedExpectation,
          verificationCommands,
          proofSourcePaths
        }),
        proofSourcePaths,
        verificationCommands
      } satisfies RuntimeImprovementRecommendation;
    })
    .sort((left, right) => {
      if (right.potentialLift !== left.potentialLift) {
        return right.potentialLift - left.potentialLift;
      }
      if (right.priorityWeight !== left.priorityWeight) {
        return right.priorityWeight - left.priorityWeight;
      }
      if (observedStateRank(left.observedState) !== observedStateRank(right.observedState)) {
        return observedStateRank(left.observedState) - observedStateRank(right.observedState);
      }
      return left.expectationTitle.localeCompare(right.expectationTitle);
    });

  return recommendations.slice(0, input.limit ?? recommendations.length);
}
