import type { ScanResult } from "../discovery/types";
import type { ArtifactReferenceModel } from "../evidence-view/types";
import type { GapCategory } from "../gap-triage/types";
import type {
  IndexDiagnosticDetail,
  IndexDiagnosticSeverityCounts,
  IndexSourceClassification,
  IndexSourceReference,
  ProjectIndexState
} from "../project-index/types";

export type WorkspaceSectionId = "overview" | "evidence" | "gaps" | "analytics" | "artifacts";

export type WorkspaceDetailKind =
  | "target"
  | "expectation"
  | "evidence"
  | "gap"
  | "diagnostic"
  | "metric"
  | "artifact";

export interface WorkspaceAttentionCounts {
  readonly covered: number;
  readonly partial: number;
  readonly atRisk: number;
  readonly blocked: number;
  readonly missing: number;
  readonly weak: number;
  readonly manualOnly: number;
  readonly stale: number;
  readonly deferred: number;
  readonly unknown: number;
  readonly gaps: Partial<Record<GapCategory, number>>;
}

export interface WorkspaceReleaseRiskCounts {
  readonly blockers: number;
  readonly accepted: number;
  readonly deferred: number;
}

export interface WorkspaceSourceMix {
  readonly projectMap: number;
  readonly structuredQualityMap: number;
  readonly parsedMarkdownFallback: number;
  readonly supplementalMarkdownNarrative: number;
}

export interface WorkspaceSummary {
  readonly projectPath: string;
  readonly targetCount: number;
  readonly artifactCount: number;
  readonly diagnosticCounts: IndexDiagnosticSeverityCounts;
  readonly attentionCounts: WorkspaceAttentionCounts;
  readonly releaseRiskCounts: WorkspaceReleaseRiskCounts;
  readonly sourceMix: WorkspaceSourceMix;
  readonly generatedAt: string;
  readonly overallStatus: string;
}

export interface WorkspaceProjectEvidenceSummary {
  readonly status?: string;
  readonly evidenceConfidence?: string;
  readonly structureConfidence?: string;
  readonly qualityScore?: string;
  readonly coverageScore?: string;
  readonly evidenceConfidenceScore?: string;
  readonly structureConfidenceScore?: string;
  readonly totalCheckCount?: number;
  readonly basis?: string;
  readonly updatedAt?: string;
  readonly branch?: string;
  readonly commit?: string;
  readonly sourcePath?: string;
}

export interface WorkspaceFreshnessSummary {
  readonly latestEvidenceAt?: string;
  readonly latestEvidenceCommit?: string;
  readonly latestEvidenceSource?: string;
  readonly projectEvidence?: WorkspaceProjectEvidenceSummary;
  readonly driftWarnings: readonly string[];
}

export interface WorkspaceActionItem {
  readonly id: string;
  readonly label: string;
  readonly targetId?: string;
  readonly targetName?: string;
  readonly section: WorkspaceSectionId;
  readonly detailKind: WorkspaceDetailKind;
  readonly detailId: string;
  readonly severity: "error" | "warning" | "info";
  readonly reason: string;
  readonly nextAction: string;
  readonly sourcePath?: string;
}

export interface WorkspaceProjectSummary {
  readonly projectName: string;
  readonly totalRiskCount: number;
  readonly totalNextProofCount: number;
  readonly topRisks: readonly WorkspaceActionItem[];
  readonly nextProofs: readonly WorkspaceActionItem[];
  readonly freshness: WorkspaceFreshnessSummary;
}

export interface TargetSummary {
  readonly targetId: string;
  readonly featureKey?: string;
  readonly name: string;
  readonly description?: string;
  readonly scope: string;
  readonly sourceType: IndexSourceClassification;
  readonly status: string;
  readonly evidenceConfidence: string;
  readonly structureConfidence: string;
  readonly mapAvailability: string;
  readonly priorityCounts: Record<string, number>;
  readonly gapCounts: Partial<Record<GapCategory, number>>;
  readonly evidenceCount: number;
  readonly expectationCount: number;
  readonly diagnosticCounts: IndexDiagnosticSeverityCounts;
  readonly releaseRiskCounts: WorkspaceReleaseRiskCounts;
  readonly riskIndicators: readonly string[];
  readonly sourceRefs: readonly IndexSourceReference[];
}

export interface WorkspaceNavigationState {
  readonly selectedTargetId?: string;
  readonly selectedSection: WorkspaceSectionId;
  readonly selectedDetailKind?: WorkspaceDetailKind;
  readonly selectedDetailId?: string;
  readonly targetRemovedMessage?: string;
}

export interface WorkspaceSection {
  readonly sectionId: WorkspaceSectionId;
  readonly title: string;
  readonly badgeCount: number;
  readonly availability: "available" | "empty" | "unavailable";
  readonly emptyState?: string;
}

export interface DetailPanelField {
  readonly label: string;
  readonly value: string;
}

export interface DetailPanelGuidance {
  readonly title: string;
  readonly explanation: string;
  readonly recommendedAction: string;
  readonly agentPrompt: string;
}

export interface DetailPanelRecord {
  readonly kind: WorkspaceDetailKind;
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly sourceAttribution: readonly IndexSourceReference[];
  readonly summary: string;
  readonly fields: readonly DetailPanelField[];
  readonly relatedRecords: readonly DetailPanelField[];
  readonly artifacts: readonly ArtifactReferenceModel[];
  readonly actions: readonly string[];
  readonly guidance?: DetailPanelGuidance;
}

export interface ArtifactExplorerRecord {
  readonly artifactId: string;
  readonly artifactKind: "discovered_artifact" | "source_reference" | "linked_evidence_artifact";
  readonly label: string;
  readonly pathOrUrl: string;
  readonly targetId: string;
  readonly sourceType: IndexSourceClassification;
  readonly diagnosticState: "ok" | "warning" | "error" | "unverified";
  readonly linkedEvidenceIds: readonly string[];
  readonly displaySafety: "display-only" | "external-url" | "missing-reference";
}

export interface Workspace {
  readonly state: ProjectIndexState;
  readonly result?: ScanResult;
  readonly summary: WorkspaceSummary;
  readonly projectSummary?: WorkspaceProjectSummary;
  readonly targets: readonly TargetSummary[];
  readonly navigation: WorkspaceNavigationState;
  readonly selectedTarget?: TargetSummary;
  readonly sections: readonly WorkspaceSection[];
  readonly artifactRecords: readonly ArtifactExplorerRecord[];
  readonly detailRecord?: DetailPanelRecord;
  readonly diagnostics: readonly IndexDiagnosticDetail[];
}

export interface BuildWorkspaceInput {
  readonly result?: ScanResult;
  readonly isLoading?: boolean;
  readonly navigation?: Partial<WorkspaceNavigationState>;
}
