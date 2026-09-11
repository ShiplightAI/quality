export const RELEASE_ENVIRONMENTS = ['staging', 'production'] as const;
export type ReleaseEnvironment = (typeof RELEASE_ENVIRONMENTS)[number];

export const RELEASE_RECORD_SOURCES = ['workflow_gate', 'historical_import'] as const;
export type ReleaseRecordSource = (typeof RELEASE_RECORD_SOURCES)[number];

export const RELEASE_PUBLISH_STATUSES = [
  'unknown',
  'publishing',
  'published',
  'failed',
  'cancelled',
] as const;
export type ReleasePublishStatus = (typeof RELEASE_PUBLISH_STATUSES)[number];

export const ANALYSIS_STATUSES = [
  'queued',
  'resolving',
  'collecting',
  'assessing',
  'evaluating',
  'allow',
  'block',
  'inconclusive',
  'error',
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const BEHAVIOR_ASSESSMENT_STATUSES = [
  'verified',
  'failed',
  'insufficient_proof',
  'conflicting_facts',
  'check_error',
  'not_applicable',
] as const;
export type BehaviorAssessmentStatus = (typeof BEHAVIOR_ASSESSMENT_STATUSES)[number];

export type BehaviorOrigin = 'explicit' | 'derived' | 'recommended';
export type BehaviorReviewStatus = 'confirmed' | 'proposed' | 'rejected';
export type BehaviorPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type RuntimeStatus = 'passed' | 'failed' | 'skipped' | 'errored' | 'unknown';

export interface SourceReference {
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly label?: string;
}
export interface ExpectedBehavior {
  readonly id: string;
  readonly featureId: string;
  readonly title: string;
  readonly description?: string;
  readonly priority: BehaviorPriority;
  readonly origin: BehaviorOrigin;
  readonly reviewStatus: BehaviorReviewStatus;
  readonly sourceRefs: readonly SourceReference[];
  readonly requiredProof: readonly string[];
  readonly applicable: boolean;
}

export interface EvidenceContribution {
  readonly id: string;
  readonly runtimeStatus: RuntimeStatus;
  readonly identityStatus: 'matched' | 'mismatched' | 'unverifiable';
  readonly collectionStatus: 'available' | 'expired' | 'missing' | 'parse_error';
  readonly relationship: 'direct' | 'partial' | 'indirect' | 'conflicting';
  readonly proves: readonly string[];
  readonly reason: string;
}

export interface BehaviorAssessment {
  readonly behaviorId: string;
  readonly featureId: string;
  readonly priority: BehaviorPriority;
  readonly origin: BehaviorOrigin;
  readonly reviewStatus: BehaviorReviewStatus;
  readonly status: BehaviorAssessmentStatus;
  readonly runtimeStatus: RuntimeStatus;
  readonly observedProof: readonly string[];
  readonly missingProof: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly reason: string;
}

export interface ReleaseRuleResult {
  readonly ruleKey: string;
  readonly status: 'pass' | 'warn' | 'fail' | 'not_applicable';
  readonly effect: 'none' | 'warning' | 'block';
  readonly assessmentIds: readonly string[];
  readonly exceptedAssessmentIds: readonly string[];
  readonly systemFactKeys: readonly string[];
  readonly reason: string;
}

export interface ReleasePolicyDecision {
  readonly decision: 'ALLOW' | 'BLOCK';
  readonly rules: readonly ReleaseRuleResult[];
  readonly blockingAssessmentIds: readonly string[];
  readonly blockingSystemFactKeys: readonly string[];
  readonly warningAssessmentIds: readonly string[];
}

export interface ReleaseSystemFactFinding {
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
  readonly featureKey?: string;
  readonly featureName?: string;
  readonly behaviorKey?: string;
  readonly behaviorTitle?: string;
  readonly evidenceKey?: string;
  readonly declarationPath?: string;
  readonly affectedPath?: string;
  readonly yamlPath?: string;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
}

export interface ReleaseSystemFact {
  readonly key: string;
  readonly status: 'passed' | 'failed';
  readonly severity: 'warning' | 'critical';
  readonly summary: string;
  readonly exceptionEligible: boolean;
  readonly findings: readonly ReleaseSystemFactFinding[];
}

export interface ReleaseException {
  readonly issueId: string;
  readonly behaviorId: string;
  readonly reason: string;
  readonly approvedByAccountId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}
