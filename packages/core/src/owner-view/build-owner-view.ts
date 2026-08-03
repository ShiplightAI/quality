import { buildProjectIndex } from "../project-index/build-index";
import { deriveExpectationAssessment, evidenceForExpectation, isFeatureConfirmed, structureLevel } from "../quality-structure/assessment";
import { groupOwnerExpectations, priorityRankFor } from "./grouping";
import { riskBadgeFor, summarizeOwnerRisk } from "./risk-summary";
import type {
  BuildOwnerViewInput,
  OwnerExpectation,
  OwnerTargetSummary,
  OwnerView
} from "./types";

function unavailable(value: string | undefined | null): string {
  return value === undefined || value === null || value.length === 0 ? "unavailable" : value;
}

function missingSummary(targetId: string): OwnerTargetSummary {
  return {
    targetId,
    displayName: targetId,
    scope: "unknown",
    sourceClassification: "parsed_markdown_fallback",
    status: "unavailable",
    evidenceConfidence: "unavailable",
    structureConfidence: "unavailable",
    sourceReferences: []
  };
}

function structuredExpectations(input: BuildOwnerViewInput): readonly OwnerExpectation[] | undefined {
  const result = input.result?.qualityMaps.results.find((mapResult) =>
    mapResult.graph?.target.normalizedId === input.targetId
  );

  const graph = result?.graph;
  if (result === undefined || graph === undefined) {
    return undefined;
  }

  // Reviewed (gate 2 confirmed AND gate 4 approved) lifts each check to HIGH
  // structure confidence; the provenance badge still shows its true origin.
  const feature = input.result?.projectMaps.primary?.map?.features.find(
    (candidate) => candidate.artifacts.qualityMapPath === graph.source.projectRelativePath
  );
  const reviewed = isFeatureConfirmed(feature?.status) && graph.checksReviewed;

  return graph.expectations.map((expectation, index) => {
    const residualRisk = graph.residualRisks.find((item) =>
      expectation.residualRiskIds.includes(item.normalizedId)
    );
    const linkedEvidence = evidenceForExpectation(graph, expectation);
    const assessment = deriveExpectationAssessment(graph, expectation);
    const riskText = residualRisk?.text ?? "None";
    const nextBestProof = expectation.proofGapNextStep ?? "No source-provided recommended action";

    return {
      expectationId: expectation.normalizedId,
      title: expectation.title,
      description: unavailable(expectation.description),
      priority: expectation.priority ?? "unknown",
      category: unavailable(expectation.category),
      status: assessment.status,
      evidenceConfidence: assessment.evidenceConfidence,
      structureConfidence: structureLevel(assessment.structureProvenance, reviewed),
      structureProvenance: assessment.structureProvenance,
      residualRisk: riskText,
      nextBestProof,
      deferredFollowUps: [],
      riskBadge: riskBadgeFor({
        status: assessment.status,
        evidenceConfidence: assessment.evidenceConfidence,
        residualRisk: riskText,
        hasEvidence: linkedEvidence.length > 0
      }),
      sourceClassification: "structured_quality_map",
      sourceReferences: graph.sourceRefs.map((sourceRef) => ({
        label: sourceRef.label,
        path: sourceRef.path,
        url: sourceRef.url
      })),
      sourceOrder: index
    };
  });
}

function fallbackExpectations(input: BuildOwnerViewInput): readonly OwnerExpectation[] | undefined {
  const target = input.result?.markdownFallback.fallbackTargets.find(
    (fallbackTarget) => fallbackTarget.targetIdentity === input.targetId
  );

  if (target === undefined) {
    return undefined;
  }

  return target.sections.map((section, index) => ({
    expectationId: `${target.targetIdentity}#section:${index}`,
    title: section.headingText,
    description: section.previewText || "unavailable",
    priority: "unknown",
    category: section.canonicalSectionType ?? "narrative",
    status: target.coverageRows[index]?.result ?? "unavailable",
    evidenceConfidence: target.coverageRows[index]?.confidence ?? "unavailable",
    structureConfidence: "UNSPECIFIED",
    structureProvenance: "unspecified",
    residualRisk: target.coverageRows[index]?.residualRisk ?? "unavailable",
    nextBestProof: "unavailable",
    deferredFollowUps: [],
    riskBadge: riskBadgeFor({
      status: target.coverageRows[index]?.result,
      evidenceConfidence: target.coverageRows[index]?.confidence,
      residualRisk: target.coverageRows[index]?.residualRisk,
      hasEvidence: target.evidenceHints.length > 0
    }),
    sourceClassification: "parsed_markdown_fallback",
    sourceReferences: target.sourceArtifacts.map((source) => ({
      label: source.artifactType === "test_spec" ? "Test spec" : "Test report",
      path: source.projectRelativePath
    })),
    sourceOrder: index
  }));
}

function filterExpectations(
  expectations: readonly OwnerExpectation[],
  highPriorityOnly: boolean | undefined
): readonly OwnerExpectation[] {
  if (highPriorityOnly !== true) {
    return expectations;
  }

  return expectations.filter((expectation) => expectation.priority === "P0" || expectation.priority === "P1");
}

export function buildOwnerView(input: BuildOwnerViewInput): OwnerView {
  if (input.result === undefined) {
    const summary = missingSummary(input.targetId);
    return {
      state: "directOpen",
      summary,
      expectations: [],
      expectationGroups: [],
      riskSummary: summarizeOwnerRisk([])
    };
  }

  const index = buildProjectIndex({ result: input.result });
  const target = index.targets.find((row) => row.targetId === input.targetId);
  if (target === undefined) {
    const summary = missingSummary(input.targetId);
    return {
      state: "missingTarget",
      summary,
      expectations: [],
      expectationGroups: [],
      riskSummary: summarizeOwnerRisk([])
    };
  }

  const summary: OwnerTargetSummary = {
    targetId: target.targetId,
    displayName: target.displayName,
    scope: target.scope,
    sourceClassification: target.sourceClassification,
    status: target.status,
    evidenceConfidence: target.evidenceConfidence,
    structureConfidence: target.structureConfidence,
    sourceReferences: target.sourceReferences
  };
  const rawExpectations = structuredExpectations(input) ?? fallbackExpectations(input) ?? [];
  const expectations = filterExpectations(rawExpectations, input.highPriorityOnly).toSorted((left, right) => {
    const priority = priorityRankFor(left.priority) - priorityRankFor(right.priority);
    return priority === 0 ? left.sourceOrder - right.sourceOrder : priority;
  });

  return {
    state: "ready",
    summary,
    expectations,
    expectationGroups: groupOwnerExpectations(expectations),
    riskSummary: summarizeOwnerRisk(expectations)
  };
}
