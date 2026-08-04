export type ProjectMapDiagnosticSeverity = "error" | "warning" | "info";

export type ProjectMapParseStatus = "parsed" | "invalid";

export interface ProjectMapSource {
  readonly projectRelativePath: string;
  readonly resolvedLocalPath: string;
  readonly sourcePattern?: string;
}

export interface ProjectMapDiagnostic {
  readonly severity: ProjectMapDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly mapPath: string;
  readonly yamlPath: string;
}

export interface ProjectMapSourceReference {
  readonly path?: string;
  readonly url?: string;
  readonly label?: string;
  readonly anchor?: string;
}

export interface ProjectMapProject {
  readonly id: string;
  readonly name: string;
  readonly summary?: string;
  readonly qualityPolicyPath?: string;
  readonly sourceRefs: readonly ProjectMapSourceReference[];
}

export interface ProjectMapActiveFeature {
  readonly id: string;
  readonly branch?: string;
  readonly specPath?: string;
  readonly phase?: string;
  readonly updatedAt?: string;
}

export type ProjectMapPriorityProvenance = "agent" | "human";

export interface ProjectMapFeatureArtifacts {
  readonly specPath?: string;
  readonly planPath?: string;
  readonly tasksPath?: string;
  readonly qualityMapPath?: string;
  readonly testReportPath?: string;
  readonly checklistPaths: readonly string[];
}

export interface ProjectMapFeature {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly status: string;
  readonly priority?: string;
  /**
   * Who set `priority` (gate 3). `human` once a person sets/adjusts it; the agent
   * must not overwrite a human-set priority during a rebuild (FR-008).
   */
  readonly priorityProvenance: ProjectMapPriorityProvenance;
  readonly sourceType?: string;
  readonly dependencies: readonly string[];
  readonly artifacts: ProjectMapFeatureArtifacts;
  readonly codeRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly openQuestions: readonly string[];
  readonly residualRisks: readonly string[];
}

export interface ParsedProjectMapDocument {
  readonly project: ProjectMapProject;
  readonly activeFeature?: ProjectMapActiveFeature;
  readonly featureOrder: readonly string[];
  readonly features: readonly ProjectMapFeature[];
  readonly productDocs: readonly ProjectMapSourceReference[];
  readonly crossFeatureConcerns: readonly {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    readonly status: string;
    readonly featureIds: readonly string[];
    readonly sourceRefs: readonly ProjectMapSourceReference[];
    readonly notes?: string;
  }[];
  readonly discovery: {
    readonly mode?: string;
    readonly evidenceGaps: readonly string[];
    readonly unresolvedDrift: readonly string[];
  };
}

export interface ParsedProjectMap {
  readonly source: ProjectMapSource;
  readonly status: ProjectMapParseStatus;
  readonly rawText: string;
  readonly map?: ParsedProjectMapDocument;
  readonly diagnostics: readonly ProjectMapDiagnostic[];
}

export interface ProjectMapParseBatch {
  readonly results: readonly ParsedProjectMap[];
  readonly primary?: ParsedProjectMap;
  readonly diagnostics: readonly ProjectMapDiagnostic[];
}
