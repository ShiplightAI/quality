import type { NormalizedQualityGraph } from "@shiplightai/quality-map";
import { buildProjectIndex } from "../project-index/build-index";
import { buildGapTriage } from "../gap-triage/build-gap-triage";
import { deriveExpectationAssessment, evidenceForExpectation, isGateContext } from "../quality-structure/assessment";
import { applyAnalyticsFilters } from "./filters";
import { buildBaselineComparison } from "./baselines";
import { gapRecordToDrilldown, expectationRecord, riskRecord } from "./drilldowns";
import { metricDefinitionFor } from "./metric-definitions";
import type {
  AnalyticsTargetSummary,
  AnalyticsView,
  BuildAnalyticsInput,
  MetricDrilldownRecord,
  MetricResult
} from "./types";

function missingSummary(targetId: string): AnalyticsTargetSummary {
  return {
    targetId,
    displayName: targetId,
    scope: "unknown",
    sourceClassification: "parsed_markdown_fallback",
    sourceReferences: []
  };
}

function percentage(numerator: number, denominator: number | undefined): number | undefined {
  return denominator === undefined || denominator === 0 ? undefined : Math.round((numerator / denominator) * 100);
}

function valueLabel(numerator: number, denominator: number | undefined): string {
  const pct = percentage(numerator, denominator);
  if (denominator === undefined) {
    return String(numerator);
  }
  return pct === undefined ? `${numerator}/${denominator}` : `${numerator}/${denominator} (${pct}%)`;
}

function metric(input: {
  readonly metricId: string;
  readonly numerator: number;
  readonly denominator?: number;
  readonly records: readonly MetricDrilldownRecord[];
  readonly excludedRecords?: readonly MetricDrilldownRecord[];
  readonly sourceClassification: MetricResult["sourceClassification"];
  readonly sourceReferences: MetricResult["sourceReferences"];
  readonly availability?: MetricResult["availability"];
  readonly formulaVerification?: MetricResult["formulaVerification"];
  readonly sourceValue?: string;
  readonly guardrail: string;
}): MetricResult {
  const definition = metricDefinitionFor(input.metricId);
  const availability = input.availability ?? (input.denominator === 0 ? "unavailable" : "available");

  return {
    metricId: input.metricId,
    title: definition.title,
    definition,
    availability,
    partial: availability === "partial",
    formulaVerification: input.formulaVerification ?? "computed",
    valueLabel: input.sourceValue ?? valueLabel(input.numerator, input.denominator),
    numerator: input.numerator,
    denominator: input.denominator,
    percentage: percentage(input.numerator, input.denominator),
    sourceValue: input.sourceValue,
    sourceClassification: input.sourceClassification,
    sourceReferences: input.sourceReferences,
    guardrail: input.guardrail,
    drilldownRecords: input.records,
    excludedRecords: input.excludedRecords ?? []
  };
}

function structuredMetrics(input: {
  readonly graph: NormalizedQualityGraph;
  readonly sourceReferences: MetricResult["sourceReferences"];
  readonly gapRecords: ReturnType<typeof buildGapTriage>["records"];
}): readonly MetricResult[] {
  const graph = input.graph;
  const assessmentByExpectationId = new Map(
    graph.expectations.map((expectation) => [
      expectation.normalizedId,
      deriveExpectationAssessment(graph, expectation)
    ])
  );
  const highPriority = graph.expectations.filter((expectation) =>
    expectation.priority === "P0" || expectation.priority === "P1"
  );
  const nonMappedPriority = graph.expectations.filter((expectation) =>
    expectation.priority !== undefined && expectation.priority !== "P0" && expectation.priority !== "P1"
  );
  const directRecords = highPriority
    .filter((expectation) => assessmentByExpectationId.get(expectation.normalizedId)?.hasAutomatedEvidence === true)
    .map((expectation) =>
      expectationRecord({ graph, expectation, reasonIncluded: "P0/P1 expectation has direct structural evidence." })
    );
  const highPriorityRecords = highPriority.map((expectation) =>
    expectationRecord({ graph, expectation, reasonIncluded: "Explicit P0/P1 denominator record." })
  );
  const gatedRecords = highPriority
    .filter((expectation) =>
      evidenceForExpectation(graph, expectation).some((evidence) => evidence.contexts.some(isGateContext))
    )
    .map((expectation) =>
      expectationRecord({ graph, expectation, reasonIncluded: "P0/P1 expectation has gate-context evidence." })
    );
  // Accepted-risk gaps are excluded from every gap metric numerator/denominator —
  // a human has signed them off, so they are no longer open gaps.
  const gapRecords = input.gapRecords.filter((record) => !record.accepted);
  const riskRecords = graph.residualRisks.flatMap((risk) => {
    const expectation = graph.expectations.find((candidate) => candidate.normalizedId === risk.expectationId);
    if (expectation === undefined) {
      return [];
    }
    const text = risk.text.toLowerCase();
    if (text.includes("accepted")) {
      return [riskRecord({ graph, expectation, risk, riskState: "accepted" })];
    }
    if (text.includes("deferred")) {
      return [riskRecord({ graph, expectation, risk, riskState: "deferred" })];
    }
    return [];
  });
  const acceptedRiskRecords = riskRecords.filter((record) => record.riskState === "accepted");
  const deferredRiskRecords = [
    ...riskRecords.filter((record) => record.riskState === "deferred"),
    ...gapRecords.filter((record) => record.category === "deferred").map((record) => gapRecordToDrilldown(record, "Deferred gap context."))
  ];
  const highPriorityAvailability = highPriority.length === 0 && graph.expectations.length > 0 ? "unavailable" : nonMappedPriority.length > 0 ? "partial" : "available";

  return [
    metric({
      metricId: "p0p1-direct-evidence",
      numerator: directRecords.length,
      denominator: highPriority.length,
      records: directRecords,
      excludedRecords: highPriorityRecords.filter((record) =>
        !directRecords.some((included) => included.expectationId === record.expectationId)
      ),
      sourceClassification: "structured_quality_map",
      sourceReferences: input.sourceReferences,
      availability: highPriorityAvailability,
      guardrail: "Uses only explicit P0/P1 labels; this is not a readiness score."
    }),
    metric({
      metricId: "p0p1-gated-evidence",
      numerator: gatedRecords.length,
      denominator: highPriority.length,
      records: gatedRecords,
      excludedRecords: highPriorityRecords.filter((record) =>
        !gatedRecords.some((included) => included.expectationId === record.expectationId)
      ),
      sourceClassification: "structured_quality_map",
      sourceReferences: input.sourceReferences,
      availability: highPriorityAvailability,
      guardrail: "Only explicit gate-context evidence is counted as gated."
    }),
    ...(["stale", "manual-only", "missing", "blocked"] as const).map((category) =>
      metric({
        metricId:
          category === "stale"
            ? "stale-evidence"
            : category === "manual-only"
              ? "manual-only-exposure"
              : category === "missing"
                ? "missing-evidence"
                : "blocked-gaps",
        numerator: gapRecords.filter((record) => record.category === category).length,
        denominator: gapRecords.length,
        records: gapRecords.filter((record) => record.category === category).map((record) =>
          gapRecordToDrilldown(record, `${record.categoryLabel} gap.`)
        ),
        sourceClassification: "structured_quality_map",
        sourceReferences: input.sourceReferences,
        guardrail: "Counted records remain traceable to gap source data."
      })
    ),
    metric({
      metricId: "accepted-risks",
      numerator: acceptedRiskRecords.length,
      denominator: graph.residualRisks.length,
      records: acceptedRiskRecords,
      sourceClassification: "structured_quality_map",
      sourceReferences: input.sourceReferences,
      guardrail: "Accepted risk is shown as context, not as resolved proof."
    }),
    metric({
      metricId: "deferred-risks",
      numerator: deferredRiskRecords.length,
      denominator: graph.residualRisks.length + gapRecords.length,
      records: deferredRiskRecords,
      sourceClassification: "structured_quality_map",
      sourceReferences: input.sourceReferences,
      guardrail: "Deferred risk is shown as context, not as resolved proof."
    })
  ];
}

export function buildAnalyticsView(input: BuildAnalyticsInput): AnalyticsView {
  if (input.result === undefined) {
    return {
      state: "directOpen",
      summary: missingSummary(input.targetId),
      filters: input.filters ?? {},
      metrics: [],
      riskSummary: { blockers: [], acceptedRisks: [], deferredRisks: [] },
      baselineComparison: buildBaselineComparison({ currentSnapshotId: input.targetId, records: [] }),
      guardrails: ["Release analytics require a selected feature."],
      missingSelection: {
        targetId: input.targetId,
        metricId: input.selectedMetricId,
        recoveryAction: "Choose a feature before opening release analytics."
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
      metrics: [],
      riskSummary: { blockers: [], acceptedRisks: [], deferredRisks: [] },
      baselineComparison: buildBaselineComparison({ currentSnapshotId: input.targetId, records: [] }),
      guardrails: ["Selected feature is unavailable."],
      missingSelection: {
        targetId: input.targetId,
        metricId: input.selectedMetricId,
        recoveryAction: "Return to the feature explorer and select an available feature."
      }
    };
  }

  const summary = {
    targetId: target.targetId,
    displayName: target.displayName,
    scope: target.scope,
    sourceClassification: target.sourceClassification,
    sourceReferences: target.sourceReferences
  } satisfies AnalyticsTargetSummary;
  const structuredResult = input.result.qualityMaps.results.find(
    (result) => result.graph?.target.normalizedId === input.targetId
  );
  const gapView = buildGapTriage({ result: input.result, targetId: input.targetId });
  const metrics =
    structuredResult?.graph === undefined
      ? [
          metric({
            metricId: "missing-evidence",
            numerator: gapView.records.filter((record) => record.category === "missing").length,
            denominator: gapView.records.length,
            records: gapView.records.map((record) => gapRecordToDrilldown(record, "Fallback analytics gap record.")),
            sourceClassification: summary.sourceClassification,
            sourceReferences: summary.sourceReferences,
            availability: gapView.records.length === 0 ? "unavailable" : "partial",
            guardrail: "Fallback analytics are partial and source-labeled."
          })
        ]
      : structuredMetrics({
          graph: structuredResult.graph,
          sourceReferences: summary.sourceReferences,
          gapRecords: gapView.records
        });
  const selectedMetric = input.selectedMetricId === undefined
    ? undefined
    : metrics.find((candidate) => candidate.metricId === input.selectedMetricId);
  const filteredMetric = selectedMetric === undefined
    ? undefined
    : {
        ...selectedMetric,
        drilldownRecords: applyAnalyticsFilters(selectedMetric.drilldownRecords, input.filters)
      };
  const allRecords = metrics.flatMap((metricResult) => metricResult.drilldownRecords);

  return {
    state: metrics.length === 0 ? "empty" : "ready",
    summary,
    filters: input.filters ?? {},
    metrics,
    filteredMetric,
    riskSummary: {
      blockers: metrics.find((item) => item.metricId === "blocked-gaps")?.drilldownRecords ?? [],
      acceptedRisks: metrics.find((item) => item.metricId === "accepted-risks")?.drilldownRecords ?? [],
      deferredRisks: metrics.find((item) => item.metricId === "deferred-risks")?.drilldownRecords ?? []
    },
    baselineComparison: buildBaselineComparison({
      graph: structuredResult?.graph,
      currentSnapshotId: input.targetId,
      records: allRecords
    }),
    guardrails: [
      "No single readiness score is computed.",
      "Metrics are structural, source-backed, and not an absolute release guarantee.",
      "Freshness and pass/fail outcomes are outside this structural-only view."
    ],
    selectedMetric,
    missingSelection:
      input.selectedMetricId !== undefined && selectedMetric === undefined
        ? {
            metricId: input.selectedMetricId,
            recoveryAction: "Choose another metric after refresh."
          }
        : undefined
  };
}
