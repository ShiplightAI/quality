import type { ScanResult } from "../discovery/types";
import type { EvidenceSourceAttribution } from "../evidence-view/types";
import type { GapCategory } from "../gap-triage/types";
import type { IndexSourceClassification, IndexSourceReference } from "../project-index/types";

export type AnalyticsState = "ready" | "missingTarget" | "directOpen" | "empty";
export type MetricAvailability = "available" | "partial" | "unavailable";
export type FormulaVerification = "computed" | "source-supplied-formula-unverified";

export interface AnalyticsFilters {
  readonly priority?: string | "all";
  readonly gapCategory?: GapCategory | "all";
  readonly sourceClassification?: IndexSourceClassification | "all";
  readonly gating?: "all" | "gated" | "ungated";
  readonly riskState?: "all" | "accepted" | "deferred";
}

export interface MetricDefinition {
  readonly metricId: string;
  readonly title: string;
  readonly formulaName: string;
  readonly numeratorDefinition: string;
  readonly denominatorDefinition: string;
  readonly includedCriteria: string;
  readonly excludedCriteria: string;
  readonly limitations: readonly string[];
}

export interface MetricDrilldownRecord {
  readonly recordId: string;
  readonly recordType: "expectation" | "gap" | "evidence" | "risk" | "source";
  readonly label: string;
  readonly targetId: string;
  readonly expectationId?: string;
  readonly evidenceId?: string;
  readonly gapId?: string;
  readonly priority: string;
  readonly gapCategory?: GapCategory;
  readonly evidenceState: string;
  readonly gatingState: "gated" | "ungated" | "unknown";
  readonly riskState?: "accepted" | "deferred";
  readonly reasonIncluded: string;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceAttribution?: EvidenceSourceAttribution;
}

export interface MetricResult {
  readonly metricId: string;
  readonly title: string;
  readonly definition: MetricDefinition;
  readonly availability: MetricAvailability;
  readonly partial: boolean;
  readonly formulaVerification: FormulaVerification;
  readonly valueLabel: string;
  readonly numerator: number;
  readonly denominator?: number;
  readonly percentage?: number;
  readonly sourceValue?: string;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
  readonly guardrail: string;
  readonly drilldownRecords: readonly MetricDrilldownRecord[];
  readonly excludedRecords: readonly MetricDrilldownRecord[];
}

export interface ReleaseRiskSummary {
  readonly acceptedRisks: readonly MetricDrilldownRecord[];
  readonly deferredRisks: readonly MetricDrilldownRecord[];
}

export interface BaselineComparison {
  readonly state: "available" | "unavailable";
  readonly baselineId?: string;
  readonly currentSnapshotId: string;
  readonly changedRecords: readonly MetricDrilldownRecord[];
  readonly addedRecords: readonly MetricDrilldownRecord[];
  readonly removedRecords: readonly MetricDrilldownRecord[];
  readonly uncertaintyNotes: readonly string[];
}

export interface AnalyticsTargetSummary {
  readonly targetId: string;
  readonly displayName: string;
  readonly scope: string;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
}

export interface AnalyticsView {
  readonly state: AnalyticsState;
  readonly summary: AnalyticsTargetSummary;
  readonly filters: AnalyticsFilters;
  readonly metrics: readonly MetricResult[];
  readonly filteredMetric?: MetricResult;
  readonly riskSummary: ReleaseRiskSummary;
  readonly baselineComparison: BaselineComparison;
  readonly guardrails: readonly string[];
  readonly selectedMetric?: MetricResult;
  readonly missingSelection?: {
    readonly targetId?: string;
    readonly metricId?: string;
    readonly recoveryAction: string;
  };
}

export interface BuildAnalyticsInput {
  readonly result?: ScanResult;
  readonly targetId: string;
  readonly filters?: AnalyticsFilters;
  readonly selectedMetricId?: string;
}
