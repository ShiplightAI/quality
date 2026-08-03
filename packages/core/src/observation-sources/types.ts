export type ObservationSourceProfileDiagnosticSeverity = "error" | "warning" | "info";

export type ObservationSourceProfileParseStatus = "parsed" | "invalid";

export interface ObservationSourceProfileSource {
  readonly projectRelativePath: string;
  readonly resolvedLocalPath: string;
  readonly sourcePattern?: string;
}

export interface ObservationSourceProfileDiagnostic {
  readonly severity: ObservationSourceProfileDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly profilePath: string;
  readonly yamlPath: string;
}

export interface ObservationSourceReference {
  readonly path?: string;
  readonly url?: string;
  readonly label?: string;
}

export interface GitHubActionsObservationSourceConfig {
  readonly repo: string;
  readonly workflow: string;
  readonly artifactNames: readonly string[];
  readonly branch?: string;
}

export interface LocalFolderObservationSourceConfig {
  readonly path: string;
}

export interface ObservationSourceProfile {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly transport: "github-actions" | "local-folder";
  readonly observationPath: string;
  readonly requiredEnv: readonly string[];
  readonly sourceRefs: readonly ObservationSourceReference[];
  readonly github?: GitHubActionsObservationSourceConfig;
  readonly localFolder?: LocalFolderObservationSourceConfig;
}

export interface ParsedObservationSourceProfilesDocument {
  readonly profiles: readonly ObservationSourceProfile[];
}

export interface ParsedObservationSourceProfiles {
  readonly source: ObservationSourceProfileSource;
  readonly status: ObservationSourceProfileParseStatus;
  readonly rawText: string;
  readonly document?: ParsedObservationSourceProfilesDocument;
  readonly diagnostics: readonly ObservationSourceProfileDiagnostic[];
}

export interface ObservationSourceProfileParseBatch {
  readonly results: readonly ParsedObservationSourceProfiles[];
  readonly primary?: ParsedObservationSourceProfiles;
  readonly diagnostics: readonly ObservationSourceProfileDiagnostic[];
}

export interface RequiredEnvStatus {
  readonly name: string;
  readonly present: boolean;
}

export interface ObservationSourceProfileEnvStatus {
  readonly profileId: string;
  readonly allPresent: boolean;
  readonly requiredEnv: readonly RequiredEnvStatus[];
}

export interface ObservationSourceExecutionSelection {
  readonly runId?: number;
  readonly branch?: string;
  readonly commit?: string;
}

export interface ExecutedObservationSourceArtifact {
  readonly declaredObservationPath: string;
  readonly matchedArtifactName?: string;
  readonly matchedObservationPath?: string;
  readonly sourcePath?: string;
}

export interface ExecutedObservationSourceRun {
  readonly runId: number;
  readonly workflowName?: string;
  readonly runUrl?: string;
  readonly commit?: string;
  readonly branch?: string;
  readonly observedAt?: string;
}

export interface ObservationSourceExecutionResult {
  readonly profileId: string;
  readonly profileName: string;
  readonly transport: ObservationSourceProfile["transport"];
  readonly status: import("../observations/types").ObservationIngestionStatus;
  readonly envStatus: ObservationSourceProfileEnvStatus;
  readonly observations: readonly import("../observations/types").NormalizedObservationRecord[];
  readonly diagnostics: readonly import("../diagnostics/diagnostic").ScanDiagnostic[];
  readonly artifacts: readonly ExecutedObservationSourceArtifact[];
  readonly selectedRun?: ExecutedObservationSourceRun;
}
