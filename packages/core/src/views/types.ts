// The scope the product shows when no saved view is selected. It is used as an
// id in its own right (recommendation export paths, the view picker), so a
// saved view may not claim it.
export const WHOLE_PROJECT_VIEW_ID = "whole-project";

export type SavedQcViewDiagnosticSeverity = "error" | "warning" | "info";

export type SavedQcViewParseStatus = "parsed" | "invalid";

export interface SavedQcViewSource {
  readonly projectRelativePath: string;
  readonly resolvedLocalPath: string;
  readonly sourcePattern?: string;
}

export interface SavedQcViewDiagnostic {
  readonly severity: SavedQcViewDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly viewsPath: string;
  readonly yamlPath: string;
}

export interface SavedQcView {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly featureIds: readonly string[];
}

export interface ParsedSavedQcViewsDocument {
  readonly views: readonly SavedQcView[];
}

export interface ParsedSavedQcViews {
  readonly source: SavedQcViewSource;
  readonly status: SavedQcViewParseStatus;
  readonly rawText: string;
  readonly document?: ParsedSavedQcViewsDocument;
  readonly diagnostics: readonly SavedQcViewDiagnostic[];
}

export interface SavedQcViewParseBatch {
  readonly results: readonly ParsedSavedQcViews[];
  readonly primary?: ParsedSavedQcViews;
  readonly diagnostics: readonly SavedQcViewDiagnostic[];
}
