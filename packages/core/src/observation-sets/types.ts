// The id `static` names the assessment that ran with no runtime observations,
// so no saved set may claim it. Shared with the JSON Schema so the parser and
// the published contract reserve exactly the same name.
export const RESERVED_OBSERVATION_SET_ID = "static";

export type ObservationSetDiagnosticSeverity = "error" | "warning" | "info";

export type ObservationSetParseStatus = "parsed" | "invalid";

export interface ObservationSetSource {
  readonly projectRelativePath: string;
  readonly resolvedLocalPath: string;
  readonly sourcePattern?: string;
}

export interface ObservationSetDiagnostic {
  readonly severity: ObservationSetDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly observationSetPath: string;
  readonly yamlPath: string;
}

export interface ObservationSetProfileReference {
  readonly profileId: string;
}

export interface ObservationSet {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly profiles: readonly ObservationSetProfileReference[];
}

export interface ParsedObservationSetsDocument {
  readonly observationSets: readonly ObservationSet[];
}

export interface ParsedObservationSets {
  readonly source: ObservationSetSource;
  readonly status: ObservationSetParseStatus;
  readonly rawText: string;
  readonly document?: ParsedObservationSetsDocument;
  readonly diagnostics: readonly ObservationSetDiagnostic[];
}

export interface ObservationSetParseBatch {
  readonly results: readonly ParsedObservationSets[];
  readonly primary?: ParsedObservationSets;
  readonly diagnostics: readonly ObservationSetDiagnostic[];
}

export interface ObservationSetProfileSelection {
  readonly profileId: string;
  readonly runId?: number;
  readonly branch?: string;
  readonly commit?: string;
}

export interface ObservationSetExecutionSelection {
  readonly branch?: string;
  readonly commit?: string;
  readonly profiles?: readonly ObservationSetProfileSelection[];
}

export interface ObservationSetExecutionProfileResult {
  readonly profileId: string;
  readonly profileName: string;
  readonly execution: import("../observation-sources/types").ObservationSourceExecutionResult;
}

export interface ObservationSetExecutionResult {
  readonly setId: string;
  readonly setName: string;
  readonly status: import("../observations/types").ObservationIngestionStatus;
  readonly profiles: readonly ObservationSetExecutionProfileResult[];
  readonly observations: readonly import("../observations/types").NormalizedObservationRecord[];
  readonly diagnostics: readonly import("../diagnostics/diagnostic").ScanDiagnostic[];
  readonly resolvedCommit?: string;
}
