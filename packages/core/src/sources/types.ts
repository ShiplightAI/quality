export type SourceKind = "doc" | "tracker_query" | "external_doc";

export type SourceOrigin = "agent" | "human";

export type SourceStatus = "current" | "stale" | "superseded" | "rejected";

/**
 * One entry in the durable human-sources layer (`.quality/config/
 * sources.yaml`). Holds a human verdict on a source, or a human-added input the
 * scan cannot reach. Lives outside the project map so a rebuild never clobbers it.
 */
export interface HumanSource {
  readonly key: string;
  readonly kind: SourceKind;
  readonly origin: SourceOrigin;
  readonly status: SourceStatus;
  readonly supersededBy?: string;
  readonly label?: string;
  readonly note?: string;
}

export interface HumanSourcesDocument {
  readonly sources: readonly HumanSource[];
}

export interface HumanSourcesSource {
  readonly projectRelativePath: string;
  readonly resolvedLocalPath: string;
  readonly sourcePattern?: string;
}

export type SourcesDiagnosticSeverity = "error" | "warning" | "info";

export interface SourcesDiagnostic {
  readonly severity: SourcesDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export type SourcesParseStatus = "parsed" | "invalid";

export interface ParsedHumanSources {
  readonly source: HumanSourcesSource;
  readonly status: SourcesParseStatus;
  readonly document?: HumanSourcesDocument;
  readonly diagnostics: readonly SourcesDiagnostic[];
}

export interface HumanSourcesBatch {
  readonly primary?: ParsedHumanSources;
  readonly diagnostics: readonly SourcesDiagnostic[];
}

export const SOURCE_KINDS: readonly SourceKind[] = ["doc", "tracker_query", "external_doc"];

export const SOURCE_STATUSES: readonly SourceStatus[] = ["current", "stale", "superseded", "rejected"];
