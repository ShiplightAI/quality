import type { ScanDiagnostic } from "../diagnostics/diagnostic";

export const INTERNAL_OBSERVATION_CONTEXT = "runtime-review";

export type ObservationIngestionStatus = "valid" | "partial" | "invalid";

export type ObservationRecordStatus = "pass" | "fail" | "error" | "skipped";

export type ObservedState = ObservationRecordStatus | "partial" | "unobserved";

export interface ObservationArtifactInput {
  readonly kind?: string;
  readonly path?: string;
  readonly url?: string;
  readonly label?: string;
  readonly [key: string]: unknown;
}

export interface ObservationSourceInput {
  readonly id?: string;
  readonly kind?: string;
  readonly label?: string;
  readonly run_id?: string;
  readonly run_url?: string;
  readonly [key: string]: unknown;
}

export interface ObservationRevisionInput {
  readonly commit?: string;
  readonly branch?: string;
  readonly dirty?: boolean;
  readonly [key: string]: unknown;
}

export interface ObservationRecordInput {
  readonly observation_id?: string;
  readonly test_file?: string;
  readonly test_case?: string;
  readonly test_class?: string;
  readonly test_project?: string;
  readonly context?: string;
  readonly status?: string;
  readonly observed_at?: string;
  readonly revision?: ObservationRevisionInput;
  readonly note?: string;
  readonly artifacts?: readonly ObservationArtifactInput[];
  readonly [key: string]: unknown;
}

export interface ObservationBatchInput {
  readonly source?: ObservationSourceInput;
  readonly context?: string;
  readonly observed_at?: string;
  readonly revision?: ObservationRevisionInput;
  readonly observations?: readonly ObservationRecordInput[];
  readonly [key: string]: unknown;
}

export interface IngestJunitXmlReportInput {
  readonly report_xml: string;
  readonly source?: ObservationSourceInput;
  readonly observed_at?: string;
  readonly revision?: ObservationRevisionInput;
  readonly artifact?: ObservationArtifactInput;
}

export interface IngestPlaywrightJsonReportInput {
  readonly report_json: string;
  readonly source?: ObservationSourceInput;
  readonly observed_at?: string;
  readonly revision?: ObservationRevisionInput;
  readonly artifact?: ObservationArtifactInput;
}

export interface IngestObservationManifestInput {
  readonly report_json: string;
  readonly source?: ObservationSourceInput;
  readonly revision?: ObservationRevisionInput;
  readonly artifact?: ObservationArtifactInput;
}

export interface QualityObservationManifestRevision {
  readonly commit: string;
  readonly branch?: string;
  readonly dirty?: boolean;
}

export interface QualityObservationManifestRun {
  readonly id: string;
  readonly url?: string;
}

export interface QualityObservationManifestRecord {
  readonly path: string;
  readonly test_case?: string;
  readonly status: ObservationRecordStatus;
  readonly observed_at?: string;
  readonly note?: string;
}

export interface QualityObservationManifest {
  readonly schema_version: 1;
  readonly revision: QualityObservationManifestRevision;
  readonly run?: QualityObservationManifestRun;
  readonly observed_at: string;
  readonly observations: readonly QualityObservationManifestRecord[];
}

export interface QualityObservationManifestParseResult {
  readonly status: "valid" | "invalid";
  readonly document?: QualityObservationManifest;
  readonly diagnostics: readonly ScanDiagnostic[];
}

export interface NormalizedObservationArtifact {
  readonly kind?: string;
  readonly path?: string;
  readonly url?: string;
  readonly label?: string;
}

export interface NormalizedObservationSource {
  readonly id?: string;
  readonly kind?: string;
  readonly label?: string;
  readonly runId?: string;
  readonly runUrl?: string;
}

export interface NormalizedObservationRevision {
  readonly commit?: string;
  readonly branch?: string;
  readonly dirty: boolean;
}

export interface NormalizedObservationRecord {
  readonly observationId: string;
  readonly testFile?: string;
  readonly testCase?: string;
  readonly testClass?: string;
  readonly testProject?: string;
  readonly context: string;
  readonly status: ObservationRecordStatus;
  readonly observedAt: string;
  readonly revision: NormalizedObservationRevision;
  readonly source: NormalizedObservationSource;
  readonly note?: string;
  readonly artifacts: readonly NormalizedObservationArtifact[];
}

export interface ObservationIngestionResult {
  readonly status: ObservationIngestionStatus;
  readonly observations: readonly NormalizedObservationRecord[];
  readonly diagnostics: readonly ScanDiagnostic[];
}

export interface ResolvedObservationRecord extends NormalizedObservationRecord {
  readonly subjectId: string;
  readonly expectationId: string;
  readonly evidenceId: string;
  readonly subjectLocalId: string;
  readonly expectationLocalId: string;
  readonly evidenceLocalId: string;
}

export interface ObservationResolutionAuditRow {
  readonly observationId: string;
  readonly matchStatus: "matched" | "unmatched" | "ambiguous";
  readonly testFile?: string;
  readonly testCase?: string;
  readonly testClass?: string;
  readonly testProject?: string;
  readonly context: string;
  readonly status: ObservationRecordStatus;
  readonly observedAt: string;
  readonly sourceId?: string;
  readonly sourceKind?: string;
  readonly sourceLabel?: string;
  readonly runId?: string;
  readonly runUrl?: string;
  readonly targetId?: string;
  readonly targetLocalId?: string;
  readonly targetName?: string;
  readonly expectationId?: string;
  readonly expectationLocalId?: string;
  readonly evidenceId?: string;
  readonly evidenceLocalId?: string;
  readonly evidencePath?: string;
}

export interface ObservationResolutionResult {
  readonly status: ObservationIngestionStatus;
  readonly observations: readonly ResolvedObservationRecord[];
  readonly auditRows: readonly ObservationResolutionAuditRow[];
  readonly diagnostics: readonly ScanDiagnostic[];
}

export interface ObservationSelection {
  readonly commit?: string;
  readonly asOf?: string;
}

export interface EvaluatedEvidenceObservation {
  readonly evidenceId: string;
  readonly evidenceLocalId: string;
  readonly state: ObservationRecordStatus | "unobserved";
  readonly observationId?: string;
  readonly observedAt?: string;
  readonly commit?: string;
  readonly runUrl?: string;
}

export interface EvaluatedExpectationSnapshot {
  readonly expectationId: string;
  readonly expectationLocalId: string;
  readonly title: string;
  readonly structuralStatus: string;
  readonly evidenceConfidence: string;
  readonly structureConfidence: string;
  readonly structureProvenance: string;
  readonly observedState: ObservedState;
  readonly latestObservedAt?: string;
  readonly evidence: readonly EvaluatedEvidenceObservation[];
}

export interface ObservationStateCounts {
  readonly pass: number;
  readonly fail: number;
  readonly error: number;
  readonly skipped: number;
  readonly partial: number;
  readonly unobserved: number;
}

export interface TargetEvaluationSnapshot {
  readonly state: "available" | "missingTarget";
  readonly targetId?: string;
  readonly targetLocalId?: string;
  readonly displayName: string;
  readonly commit?: string;
  readonly evaluatedAt: string;
  readonly observedState: ObservedState;
  readonly counts: ObservationStateCounts;
  readonly expectations: readonly EvaluatedExpectationSnapshot[];
  readonly diagnostics: readonly ScanDiagnostic[];
  readonly missingSelection?: {
    readonly targetId: string;
    readonly recoveryAction: string;
  };
}

export interface ObservationContextQualityRollup {
  readonly qualityScore?: number;
  readonly evaluatedTargetCount: number;
  readonly evaluatedExpectationCount: number;
  readonly basis: string;
}

export interface BuildTargetEvaluationInput {
  readonly result?: import("../discovery/types").ScanResult;
  readonly targetId: string;
  readonly observations: ObservationResolutionResult;
  readonly selection: ObservationSelection;
}
