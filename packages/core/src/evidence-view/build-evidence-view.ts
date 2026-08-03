import { buildProjectIndex } from "../project-index/build-index";
import {
  buildFallbackEvidenceRelationships,
  buildStructuredEvidenceRelationships
} from "./relationships";
import type {
  BuildEvidenceViewInput,
  EvidenceTargetSummary,
  EvidenceView
} from "./types";

function missingSummary(targetId: string): EvidenceTargetSummary {
  return {
    targetId,
    displayName: targetId,
    scope: "unknown",
    sourceClassification: "parsed_markdown_fallback",
    sourceReferences: []
  };
}

function missingSelectionFor(input: BuildEvidenceViewInput): EvidenceView["missingSelection"] | undefined {
  if (input.selectedExpectationId === undefined && input.selectedEvidenceId === undefined) {
    return undefined;
  }

  return {
    expectationId: input.selectedExpectationId,
    evidenceId: input.selectedEvidenceId,
    recoveryAction: "Return to the feature explorer or refresh the scan."
  };
}

export function buildEvidenceView(input: BuildEvidenceViewInput): EvidenceView {
  if (input.result === undefined) {
    return {
      state: "directOpen",
      summary: missingSummary(input.targetId),
      expectationGroups: [],
      relationships: [],
      canonicalEvidence: [],
      diagnostics: [],
      selectedExpectationId: input.selectedExpectationId,
      missingSelection: missingSelectionFor(input)
    };
  }

  const index = buildProjectIndex({ result: input.result });
  const target = index.targets.find((row) => row.targetId === input.targetId);

  if (target === undefined) {
    return {
      state: "missingTarget",
      summary: missingSummary(input.targetId),
      expectationGroups: [],
      relationships: [],
      canonicalEvidence: [],
      diagnostics: [],
      selectedExpectationId: input.selectedExpectationId,
      missingSelection: {
        targetId: input.targetId,
        expectationId: input.selectedExpectationId,
        evidenceId: input.selectedEvidenceId,
        recoveryAction: "Return to the feature explorer and select an available feature."
      }
    };
  }

  const summary: EvidenceTargetSummary = {
    targetId: target.targetId,
    displayName: target.displayName,
    scope: target.scope,
    sourceClassification: target.sourceClassification,
    sourceReferences: target.sourceReferences
  };
  const structuredResult = input.result.qualityMaps.results.find(
    (result) => result.graph?.target.normalizedId === input.targetId
  );
  const structuredGraph = structuredResult?.graph;
  const built =
    structuredGraph === undefined
      ? (() => {
          const fallbackTarget = input.result?.markdownFallback.fallbackTargets.find(
            (candidate) => candidate.targetIdentity === input.targetId
          );

          return fallbackTarget === undefined
            ? {
                expectationGroups: [],
                relationships: [],
                canonicalEvidence: [],
                diagnostics: []
              }
            : buildFallbackEvidenceRelationships({
                target: fallbackTarget,
                selectedExpectationId: input.selectedExpectationId
              });
        })()
      : buildStructuredEvidenceRelationships({
          graph: structuredGraph,
          diagnostics: structuredResult?.diagnostics ?? [],
          selectedExpectationId: input.selectedExpectationId
        });
  const selectedExpectationExists =
    input.selectedExpectationId === undefined ||
    built.expectationGroups.some((group) => group.expectationId === input.selectedExpectationId);
  const selectedEvidenceExists =
    input.selectedEvidenceId === undefined ||
    built.canonicalEvidence.some((evidence) => evidence.evidenceId === input.selectedEvidenceId);

  return {
    state: built.expectationGroups.length === 0 ? "empty" : "ready",
    summary,
    expectationGroups: built.expectationGroups,
    relationships: built.relationships,
    canonicalEvidence: built.canonicalEvidence,
    diagnostics: built.diagnostics,
    selectedExpectationId: input.selectedExpectationId,
    missingSelection:
      selectedExpectationExists && selectedEvidenceExists
        ? undefined
        : {
            expectationId: selectedExpectationExists ? undefined : input.selectedExpectationId,
            evidenceId: selectedEvidenceExists ? undefined : input.selectedEvidenceId,
            recoveryAction: "Refresh again or choose another evidence row."
          }
  };
}
