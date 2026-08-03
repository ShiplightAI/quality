import { buildProjectIndex } from "../project-index/build-index";
import { classifyFallbackGaps, classifyStructuredGaps } from "./classify-gaps";
import { applyGapFilters, groupGapRecords, summarizeGapRecords } from "./filters";
import type { BuildGapTriageInput, GapTargetSummary, GapTriageView } from "./types";

function missingSummary(targetId: string): GapTargetSummary {
  return {
    targetId,
    displayName: targetId,
    scope: "unknown",
    sourceClassification: "parsed_markdown_fallback",
    sourceReferences: []
  };
}

export function buildGapTriage(input: BuildGapTriageInput): GapTriageView {
  if (input.result === undefined) {
    return {
      state: "directOpen",
      summary: missingSummary(input.targetId),
      filters: input.filters ?? {},
      records: [],
      filteredRecords: [],
      groups: [],
      summaries: [],
      diagnostics: [],
      missingSelection: {
        targetId: input.targetId,
        expectationId: input.selectedExpectationId,
        evidenceId: input.selectedEvidenceId,
        gapId: input.selectedGapId,
        recoveryAction: "Choose a feature before opening QA gap triage."
      }
    };
  }

  const index = buildProjectIndex({ result: input.result });
  const target = index.targets.find((row) => row.targetId === input.targetId);
  if (target === undefined) {
    return {
      state: "missingTarget",
      summary: missingSummary(input.targetId),
      filters: input.filters ?? {},
      records: [],
      filteredRecords: [],
      groups: [],
      summaries: [],
      diagnostics: [],
      missingSelection: {
        targetId: input.targetId,
        expectationId: input.selectedExpectationId,
        evidenceId: input.selectedEvidenceId,
        gapId: input.selectedGapId,
        recoveryAction: "Return to the feature explorer and select an available feature."
      }
    };
  }

  const summary: GapTargetSummary = {
    targetId: target.targetId,
    displayName: target.displayName,
    scope: target.scope,
    sourceClassification: target.sourceClassification,
    sourceReferences: target.sourceReferences
  };
  const structuredResult = input.result.qualityMaps.results.find(
    (result) => result.graph?.target.normalizedId === input.targetId
  );
  const fallbackTarget = input.result.markdownFallback.fallbackTargets.find(
    (candidate) => candidate.targetIdentity === input.targetId
  );
  const records =
    structuredResult?.graph !== undefined
      ? classifyStructuredGaps(structuredResult)
      : fallbackTarget === undefined
        ? []
        : classifyFallbackGaps(fallbackTarget);
  const filteredRecords = applyGapFilters(records, input.filters);
  const selectedGap =
    input.selectedGapId === undefined
      ? undefined
      : records.find((record) => record.gapId === input.selectedGapId);

  return {
    state: records.length === 0 ? "empty" : "ready",
    summary,
    filters: input.filters ?? {},
    records,
    filteredRecords,
    groups: groupGapRecords(filteredRecords),
    summaries: summarizeGapRecords(records),
    diagnostics: records.flatMap((record) => record.diagnostics),
    selectedGap,
    missingSelection:
      input.selectedGapId !== undefined && selectedGap === undefined
        ? {
            gapId: input.selectedGapId,
            expectationId: input.selectedExpectationId,
            evidenceId: input.selectedEvidenceId,
            recoveryAction: "Refresh again or choose another gap row."
          }
        : undefined
  };
}
