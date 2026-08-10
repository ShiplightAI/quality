import type { IndexSourceClassification, IndexSourceReference } from "../project-index/types";

export type OwnerViewState = "ready" | "missingTarget" | "directOpen";
export type OwnerRiskBadge = "Covered" | "Partial" | "Gap" | "Missing" | "Unknown";

export interface OwnerTargetSummary {
  readonly targetId: string;
  readonly displayName: string;
  readonly scope: string;
  readonly sourceClassification: IndexSourceClassification;
  readonly status: string;
  readonly evidenceConfidence: string;
  readonly structureConfidence: string;
  readonly sourceReferences: readonly IndexSourceReference[];
}

export interface OwnerExpectation {
  readonly expectationId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: string;
  readonly category: string;
  readonly status: string;
  readonly evidenceConfidence: string;
  readonly structureConfidence: string;
  readonly structureProvenance: string;
  readonly residualRisk: string;
  readonly nextBestProof: string;
  readonly deferredFollowUps: readonly string[];
  readonly riskBadge: OwnerRiskBadge;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
  readonly sourceOrder: number;
}

export interface OwnerExpectationGroup {
  readonly priority: string;
  readonly expectations: readonly OwnerExpectation[];
}

export interface OwnerRiskSummary {
  readonly badgeCounts: Partial<Record<OwnerRiskBadge, number>>;
  readonly residualRisks: readonly string[];
}

export interface OwnerView {
  readonly state: OwnerViewState;
  readonly summary: OwnerTargetSummary;
  readonly expectations: readonly OwnerExpectation[];
  readonly expectationGroups: readonly OwnerExpectationGroup[];
  readonly riskSummary: OwnerRiskSummary;
}

export interface BuildOwnerViewInput {
  readonly result?: import("../discovery/types").ScanResult;
  readonly targetId: string;
  readonly highPriorityOnly?: boolean;
}

export interface EvidenceDrilldownContext {
  readonly targetId: string;
  readonly expectationId: string;
  readonly expectationTitle: string;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
}
