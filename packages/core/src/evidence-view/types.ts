import type {
  QualityMapDiagnosticSeverity,
  QualityMapSourceAttribution
} from "@shiplightai/quality-map";
import type { ScanResult } from "../discovery/types";
import type { MarkdownSourceAttribution } from "../markdown-fallback/types";
import type {
  IndexSourceClassification,
  IndexSourceReference
} from "../project-index/types";

export type EvidenceViewState = "ready" | "missingTarget" | "directOpen" | "empty";

export type EvidenceSourceClassification =
  | IndexSourceClassification
  | "structured_quality_map"
  | "parsed_markdown_fallback";

export type EvidenceRelationshipKind =
  | "target-expectation"
  | "expectation-task"
  | "expectation-evidence"
  | "evidence-latest-result"
  | "latest-result-artifact"
  | "expectation-residual-risk";

export type ArtifactReferenceKind = "local_path" | "external_url" | "unknown";

export type ArtifactAvailability = "available" | "unverified" | "unavailable";

export type ArtifactPortability = "relative" | "absolute" | "external" | "unknown";

export interface EvidenceSourceAttribution {
  readonly sourceClassification: EvidenceSourceClassification;
  readonly referencePath?: string;
  readonly referenceLabel?: string;
  readonly yamlPath?: string;
  readonly headingPath?: string;
  readonly line?: number;
  readonly snippet?: string;
}

export interface EvidenceDiagnostic {
  readonly id: string;
  readonly severity: QualityMapDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly sourcePath?: string;
  readonly affectedId?: string;
}

export interface EvidenceRelationship {
  readonly id: string;
  readonly kind: EvidenceRelationshipKind;
  readonly fromId: string;
  readonly fromLabel: string;
  readonly toId: string;
  readonly toLabel: string;
  readonly sourceAttribution: EvidenceSourceAttribution;
}

export interface EvidenceTaskNode {
  readonly taskId: string;
  readonly title: string;
  readonly path: string;
  readonly status: string;
  readonly sourceAttribution: EvidenceSourceAttribution;
}

export interface EvidenceLatestResultNode {
  readonly latestResultId: string;
  readonly status: string;
  readonly runAt: string;
  readonly commit: string;
  readonly sourceAttribution: EvidenceSourceAttribution;
}

export interface EvidenceResidualRiskNode {
  readonly residualRiskId: string;
  readonly text: string;
  readonly sourceAttribution: EvidenceSourceAttribution;
}

export interface ArtifactReferenceModel {
  readonly artifactId: string;
  readonly label: string;
  readonly pathOrUrl: string;
  readonly kind: ArtifactReferenceKind;
  readonly href?: string;
  readonly clickableFileLink: boolean;
  readonly availability: ArtifactAvailability;
  readonly portability: ArtifactPortability;
  readonly type: string;
  readonly sourceAttribution: EvidenceSourceAttribution;
}

export interface EvidenceCanonicalRecord {
  readonly evidenceId: string;
  readonly localId: string;
  readonly label: string;
  readonly type: string;
  readonly pathOrUrl: string;
  readonly command: string;
  readonly depth: string;
  readonly contexts: readonly string[];
  readonly notes: string;
  readonly gated: string;
  readonly sourceClassification: EvidenceSourceClassification;
  readonly sourceAttribution: EvidenceSourceAttribution;
  readonly linkedExpectationIds: readonly string[];
}

export interface EvidenceRelationshipRow {
  readonly rowId: string;
  readonly expectationId: string;
  readonly evidenceId?: string;
  readonly evidenceLabel: string;
  readonly evidenceType: string;
  readonly evidenceState: string;
  readonly evidenceDepth: string;
  readonly latestResult?: EvidenceLatestResultNode;
  readonly tasks: readonly EvidenceTaskNode[];
  readonly artifacts: readonly ArtifactReferenceModel[];
  readonly residualRisks: readonly EvidenceResidualRiskNode[];
  readonly relationships: readonly EvidenceRelationship[];
  readonly diagnostics: readonly EvidenceDiagnostic[];
  readonly sourceClassification: EvidenceSourceClassification;
}

export interface EvidenceExpectationGroup {
  readonly expectationId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: string;
  readonly category: string;
  readonly sourceClassification: EvidenceSourceClassification;
  readonly sourceAttribution: EvidenceSourceAttribution;
  readonly sourceReferences: readonly IndexSourceReference[];
  readonly tasks: readonly EvidenceTaskNode[];
  readonly rows: readonly EvidenceRelationshipRow[];
  readonly residualRisks: readonly EvidenceResidualRiskNode[];
  readonly diagnostics: readonly EvidenceDiagnostic[];
  readonly isSelected: boolean;
}

export interface EvidenceTargetSummary {
  readonly targetId: string;
  readonly displayName: string;
  readonly scope: string;
  readonly sourceClassification: EvidenceSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
}

export interface EvidenceDrawerExpectationContext {
  readonly expectationId: string;
  readonly title: string;
}

export interface EvidenceDrawerField {
  readonly label: string;
  readonly value: string;
}

export interface EvidenceDrawerModel {
  readonly state: "ready" | "missingEvidence";
  readonly evidenceId: string;
  readonly title: string;
  readonly selectedExpectation?: EvidenceDrawerExpectationContext;
  readonly otherLinkedExpectations: readonly EvidenceDrawerExpectationContext[];
  readonly fields: readonly EvidenceDrawerField[];
  readonly latestResult?: EvidenceLatestResultNode;
  readonly artifacts: readonly ArtifactReferenceModel[];
  readonly residualRisks: readonly EvidenceResidualRiskNode[];
  readonly diagnostics: readonly EvidenceDiagnostic[];
  readonly sourceAttribution?: EvidenceSourceAttribution;
}

export interface EvidenceView {
  readonly state: EvidenceViewState;
  readonly summary: EvidenceTargetSummary;
  readonly expectationGroups: readonly EvidenceExpectationGroup[];
  readonly relationships: readonly EvidenceRelationship[];
  readonly canonicalEvidence: readonly EvidenceCanonicalRecord[];
  readonly diagnostics: readonly EvidenceDiagnostic[];
  readonly selectedExpectationId?: string;
  readonly missingSelection?: {
    readonly targetId?: string;
    readonly expectationId?: string;
    readonly evidenceId?: string;
    readonly recoveryAction: string;
  };
}

export interface BuildEvidenceViewInput {
  readonly result?: ScanResult;
  readonly targetId: string;
  readonly selectedExpectationId?: string;
  readonly selectedEvidenceId?: string;
}

export type EvidenceSourceAttributionInput =
  | QualityMapSourceAttribution
  | MarkdownSourceAttribution;
