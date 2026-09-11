import type {
  AnalysisStatus,
  BehaviorAssessmentStatus,
  BehaviorOrigin,
  BehaviorPriority,
  BehaviorReviewStatus,
  ReleaseEnvironment,
  ReleasePublishStatus,
  ReleaseRecordSource,
  RuntimeStatus,
  SourceReference,
} from "./types";

export interface ReleaseListAttemptView {
  readonly status: AnalysisStatus;
  readonly decision: "ALLOW" | "BLOCK" | null;
  readonly attemptNumber: number;
}

/**
 * Serializable list projection consumed by shared release presentation.
 * Hosts map persistence records into this shape at their server boundary.
 */
export interface ReleaseListItemView {
  readonly id: string;
  readonly repository: string;
  readonly workflowName: string;
  readonly source: ReleaseRecordSource;
  readonly workflowRunId: string;
  readonly workflowUrl: string;
  readonly commitSha: string;
  readonly environment: ReleaseEnvironment;
  readonly components: readonly string[];
  readonly publishStatus: ReleasePublishStatus;
  readonly createdAt: string;
  readonly latestAttempt: ReleaseListAttemptView | null;
}

export interface ReleaseListView {
  readonly records: readonly ReleaseListItemView[];
  readonly nextCursor: string | null;
}

export interface ReleaseAttemptView {
  readonly id: string;
  readonly attemptNumber: number;
  readonly triggerType: "workflow_gate" | "historical_import" | "manual_reanalysis";
  readonly status: AnalysisStatus;
  readonly analyzerVersion: string;
  readonly factSetHash: string | null;
  readonly decision: "ALLOW" | "BLOCK" | null;
  readonly summary: unknown;
  readonly diagnostics: readonly Record<string, unknown>[];
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
}

export interface ReleaseSystemFactView {
  readonly id: string;
  readonly factKey: string;
  readonly status: "passed" | "failed";
  readonly severity: "warning" | "critical";
  readonly summary: string;
  readonly exceptionEligible: boolean;
  /** Persisted JSON is validated before presentation. */
  readonly findings: unknown;
}

export interface ReleaseAnalysisHealthView {
  readonly systemFacts: readonly ReleaseSystemFactView[];
}

export interface ReleaseAnalysisHistoryView {
  readonly attempts: readonly ReleaseAttemptView[];
}

export interface ReleaseEvidenceRecordView {
  readonly id: string;
  readonly evidenceKey: string;
  readonly kind: string;
  readonly sourceName: string;
  readonly runtimeStatus: RuntimeStatus;
  readonly identityStatus: "matched" | "mismatched" | "unverifiable";
  readonly collectionStatus: "available" | "expired" | "missing" | "parse_error";
  readonly fileRef: SourceReference | null;
  readonly providerRef: string | null;
  readonly archiveRef: string | null;
  readonly contentHash: string | null;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface ReleaseEvidenceInputsView extends ReleaseAnalysisHealthView {
  readonly repository: string;
  readonly release: {
    readonly commitSha: string;
  };
  readonly evidence: readonly ReleaseEvidenceRecordView[];
}

export interface ReleaseFeatureSnapshotView {
  readonly id: string;
  readonly featureKey: string;
  readonly name: string;
  readonly description: string;
  readonly priority: BehaviorPriority;
  readonly status: string;
  readonly sourceRefs: readonly SourceReference[];
  readonly diagnostics: readonly Record<string, unknown>[];
}

export interface ReleaseBehaviorSnapshotView {
  readonly id: string;
  readonly behaviorKey: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: BehaviorPriority;
  readonly origin: BehaviorOrigin;
  readonly reviewStatus: BehaviorReviewStatus;
  readonly sourceRefs: readonly SourceReference[];
  readonly requiredProof: readonly string[];
  readonly applicable: boolean;
}

export interface ReleaseBehaviorItemView {
  readonly featureId: string;
  readonly behavior: ReleaseBehaviorSnapshotView;
}

export interface ReleaseBehaviorAssessmentView {
  readonly id: string;
  readonly behaviorSnapshotId: string;
  readonly status: BehaviorAssessmentStatus;
  readonly runtimeStatus: RuntimeStatus;
  readonly observedProof: readonly string[];
  readonly missingProof: readonly string[];
  readonly reason: string;
}

export interface ReleaseIssueView {
  readonly id: string;
  readonly assessmentId: string | null;
  readonly systemFactId: string | null;
  readonly kind: string;
  readonly severity: string;
  readonly title: string;
  readonly reason: string;
  readonly recommendedAction: string;
  readonly blocksWithoutException: boolean;
}

export interface ReleaseAssessmentEvidenceView {
  readonly assessmentId: string;
  readonly evidenceRecordId: string;
  readonly relationship: "direct" | "partial" | "indirect" | "conflicting";
  readonly reason: string;
}

export interface ReleaseFeatureBrowserView {
  readonly repository: string;
  readonly release: {
    readonly commitSha: string;
  };
  readonly features: readonly ReleaseFeatureSnapshotView[];
  readonly behaviors: readonly ReleaseBehaviorItemView[];
  readonly assessments: readonly ReleaseBehaviorAssessmentView[];
  readonly issues: readonly ReleaseIssueView[];
  readonly assessmentEvidence: readonly ReleaseAssessmentEvidenceView[];
}

export interface ReleaseRuleResultView {
  readonly id: string;
  readonly ruleKey: string;
  readonly status: "pass" | "warn" | "fail" | "not_applicable";
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly effect: "none" | "warning" | "block";
  readonly reason: string;
}

export interface ReleaseIssueEvidenceView
  extends ReleaseFeatureBrowserView,
    ReleaseAnalysisHealthView {
  readonly evidence: readonly ReleaseEvidenceRecordView[];
  readonly rules: readonly ReleaseRuleResultView[];
}

export interface ReleaseExceptionView {
  readonly id: string;
  readonly issueId: string;
  readonly reason: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly isActive: boolean;
}

/**
 * Serializable detail projection consumed by the complete shared release UI.
 * Authentication, persistence and exception authorization stay in the host.
 */
export interface ReleaseDetailView
  extends ReleaseIssueEvidenceView,
    ReleaseAnalysisHistoryView {
  readonly release: {
    readonly id: string;
    readonly commitSha: string;
    readonly workflowName: string;
    readonly workflowUrl: string;
    readonly workflowRunId: string;
    readonly environment: ReleaseEnvironment;
    readonly components: readonly string[];
    readonly publishStatus: ReleasePublishStatus;
  };
  readonly exceptions: readonly ReleaseExceptionView[];
}
