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

export interface HostObservationSourceConfig {
  readonly provider: string;
  readonly options: Readonly<Record<string, string>>;
}

// The single list every consumer reads: the parser validates against it and the
// published JSON Schema enumerates it, so a new transport cannot be accepted by
// one and rejected by the other.
export const OBSERVATION_SOURCE_TRANSPORTS = ["github-actions", "local-folder", "host"] as const;

export type ObservationSourceTransport = (typeof OBSERVATION_SOURCE_TRANSPORTS)[number];

export interface ObservationSourceProfile {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly transport: ObservationSourceTransport;
  /**
   * Path of the canonical quality-observations JSON inside the fetched artifact
   * or folder. Absent for `host` transports, which have no file to address —
   * validation requires it for the two file-based transports.
   */
  readonly observationPath?: string;
  readonly requiredEnv: readonly string[];
  readonly sourceRefs: readonly ObservationSourceReference[];
  readonly github?: GitHubActionsObservationSourceConfig;
  readonly localFolder?: LocalFolderObservationSourceConfig;
  readonly host?: HostObservationSourceConfig;
}

/**
 * A transport the embedding application supplies, addressed by name from
 * `host.provider` in the profile.
 *
 * This is the seam that lets an integration read results from somewhere the
 * engine has no business knowing about — a platform database, a vendor API —
 * without that knowledge entering this package. The handler's only job is to
 * FETCH and SHAPE: it returns records in the canonical input form and the
 * engine keeps everything that follows (normalization, identity, resolution
 * against the quality map, every diagnostic). A handler that resolved
 * observations onto checks itself would be deciding what proves what outside
 * the engine, which is exactly what the independence rule forbids.
 */
export type HostObservationTransport = (input: {
  readonly profile: ObservationSourceProfile;
  readonly selection?: ObservationSourceExecutionSelection;
  readonly projectRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
}) => Promise<HostObservationTransportResult>;

export interface HostObservationTransportResult {
  readonly batches: readonly import("../observations/types").ObservationBatchInput[];
  readonly diagnostics?: readonly import("../diagnostics/diagnostic").ScanDiagnostic[];
  readonly selectedRun?: ExecutedObservationSourceRun;
}

export type HostObservationTransportRegistry = Readonly<Record<string, HostObservationTransport>>;

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
  readonly transport: ObservationSourceTransport;
  readonly status: import("../observations/types").ObservationIngestionStatus;
  readonly envStatus: ObservationSourceProfileEnvStatus;
  readonly observations: readonly import("../observations/types").NormalizedObservationRecord[];
  readonly diagnostics: readonly import("../diagnostics/diagnostic").ScanDiagnostic[];
  readonly artifacts: readonly ExecutedObservationSourceArtifact[];
  readonly selectedRun?: ExecutedObservationSourceRun;
}
