import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import type { ScanResult } from "../discovery/types";

export type IndexSourceClassification =
  | "project_map"
  | "structured_quality_map"
  | "parsed_markdown_fallback"
  | "supplemental_markdown_narrative";

export type ProjectIndexState =
  | "loading"
  | "empty"
  | "invalidProject"
  | "scanFailure"
  | "partialDiagnostics"
  | "success";

export type TargetDestinationKind = "owner" | "evidence" | "gaps" | "analytics";

export interface IndexSourceReference {
  readonly label?: string;
  readonly path?: string;
  readonly url?: string;
}

export interface IndexTargetRow {
  readonly targetId: string;
  readonly featureKey?: string;
  readonly displayName: string;
  readonly description?: string;
  readonly scope: string;
  readonly sourceClassification: IndexSourceClassification;
  readonly status: string;
  readonly evidenceConfidence: string;
  readonly structureConfidence: string;
  readonly mapAvailability: string;
  readonly sortOrder?: number;
  readonly sourceReferences: readonly IndexSourceReference[];
  readonly diagnostics: readonly IndexDiagnosticDetail[];
}

export interface IndexDiagnosticSeverityCounts {
  readonly error: number;
  readonly warning: number;
  readonly info: number;
}

export interface IndexDiagnosticDetail {
  readonly id: string;
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly sourcePath?: string;
  readonly affectedTargetId?: string;
}

export interface IndexDiagnosticSummary {
  readonly severityCounts: IndexDiagnosticSeverityCounts;
  readonly details: readonly IndexDiagnosticDetail[];
}

export interface ProjectIndex {
  readonly state: ProjectIndexState;
  readonly result?: ScanResult;
  readonly targets: readonly IndexTargetRow[];
  readonly diagnostics: IndexDiagnosticSummary;
}

export interface BuildProjectIndexInput {
  readonly result?: ScanResult;
  readonly isLoading?: boolean;
  readonly extraDiagnostics?: readonly ScanDiagnostic[];
}

export interface TargetNavigationContext {
  readonly destinationKind: TargetDestinationKind;
  readonly targetId: string;
  readonly displayName: string;
  readonly sourceClassification: IndexSourceClassification;
  readonly sourceReferences: readonly IndexSourceReference[];
}
