import type {
  NormalizedExpectation,
  NormalizedQualityGraph,
  NormalizedResidualRisk
} from "@shiplightai/quality-map";
import { structuredAttribution, unavailable } from "../evidence-view";
import type { GapRecord } from "../gap-triage/types";
import { isGateContext, proofTier } from "../quality-structure/assessment";
import type { MetricDrilldownRecord } from "./types";

export function expectationRecord(input: {
  readonly graph: NormalizedQualityGraph;
  readonly expectation: NormalizedExpectation;
  readonly reasonIncluded: string;
  readonly gapCategory?: GapRecord["category"];
  readonly riskState?: MetricDrilldownRecord["riskState"];
}): MetricDrilldownRecord {
  const evidence = input.graph.evidence.find((candidate) =>
    input.expectation.linkedEvidenceIds.includes(candidate.normalizedId)
  );

  return {
    recordId: `${input.expectation.normalizedId}:${input.reasonIncluded}`,
    recordType: "expectation",
    label: input.expectation.title,
    targetId: input.graph.target.normalizedId,
    expectationId: input.expectation.normalizedId,
    evidenceId: evidence?.normalizedId,
    priority: unavailable(input.expectation.priority),
    gapCategory: input.gapCategory,
    evidenceState: evidence === undefined ? unavailable(undefined) : proofTier(evidence.type),
    gatingState:
      evidence === undefined
        ? "unknown"
        : evidence.contexts.some(isGateContext)
          ? "gated"
          : evidence.contexts.length > 0
            ? "ungated"
            : "unknown",
    riskState: input.riskState,
    reasonIncluded: input.reasonIncluded,
    sourceClassification: "structured_quality_map",
    sourceAttribution: structuredAttribution(input.expectation.sourceAttribution)
  };
}

export function gapRecordToDrilldown(record: GapRecord, reasonIncluded: string): MetricDrilldownRecord {
  return {
    recordId: `${record.gapId}:${reasonIncluded}`,
    recordType: "gap",
    label: record.expectationTitle,
    targetId: record.targetId,
    expectationId: record.expectationId,
    evidenceId: record.evidence[0]?.evidenceId,
    gapId: record.gapId,
    priority: record.priority,
    gapCategory: record.category,
    evidenceState: record.evidenceState,
    gatingState: "unknown",
    reasonIncluded,
    sourceClassification: record.sourceClassification,
    sourceAttribution: record.sourceAttribution
  };
}

export function riskRecord(input: {
  readonly graph: NormalizedQualityGraph;
  readonly expectation: NormalizedExpectation;
  readonly risk: NormalizedResidualRisk;
  readonly riskState: "accepted" | "deferred";
}): MetricDrilldownRecord {
  return {
    recordId: `${input.risk.normalizedId}:${input.riskState}`,
    recordType: "risk",
    label: input.risk.text,
    targetId: input.graph.target.normalizedId,
    expectationId: input.expectation.normalizedId,
    priority: unavailable(input.expectation.priority),
    evidenceState: "risk-context",
    gatingState: "unknown",
    riskState: input.riskState,
    reasonIncluded: `${input.riskState} risk context is source-provided.`,
    sourceClassification: "structured_quality_map",
    sourceAttribution: structuredAttribution(input.risk.sourceAttribution)
  };
}
