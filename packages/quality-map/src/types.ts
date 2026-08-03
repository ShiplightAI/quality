import type { StructureProvenance } from "./schema";

export type QualityMapDiagnosticSeverity = "error" | "warning" | "info";

export type QualityMapParseStepStatus = "parsed" | "invalid";

export type QualityMapGraphStatus = "valid" | "partial" | "invalid";

export type QualityMapEntityType =
  | "target"
  | "source_ref"
  | "expectation"
  | "task"
  | "evidence"
  | "residual_risk";

export interface QualityMapSource {
  readonly projectRelativePath: string;
  readonly resolvedLocalPath: string;
  readonly targetCandidateId?: string;
  readonly sourcePattern?: string;
}

export interface QualityMapSourceAttribution {
  readonly sourceClassification: "structured_quality_map";
  readonly mapPath: string;
  readonly yamlPath: string;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
}

export interface QualityMapDiagnostic {
  readonly severity: QualityMapDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly mapPath: string;
  readonly yamlPath: string;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
  readonly affectedEntityId?: string;
}

export interface QualityMapSourceRefInput {
  readonly path?: string;
  readonly url?: string;
  readonly label?: string;
  readonly anchor?: string;
  readonly [key: string]: unknown;
}

export interface QualityMapTargetInput {
  readonly id?: string;
  readonly name?: string;
  readonly scope?: string;
  readonly aliases?: readonly string[];
  readonly source_refs?: readonly QualityMapSourceRefInput[];
  readonly [key: string]: unknown;
}

export interface QualityMapTaskInput {
  readonly id?: string;
  readonly path?: string;
  readonly status?: string;
  readonly title?: string;
  readonly [key: string]: unknown;
}

export interface QualityMapPolicyOverrideInput {
  readonly preferred_modalities?: readonly string[];
  readonly discouraged_modalities?: readonly string[];
  readonly required_modalities?: readonly string[];
  readonly required_contexts?: readonly string[];
  readonly require_gate?: boolean;
  readonly notes?: string;
  readonly [key: string]: unknown;
}

export interface QualityMapProofGapInput {
  readonly summary?: string;
  readonly next_step?: string | null;
  readonly [key: string]: unknown;
}

export interface QualityMapEvidenceInput {
  readonly id?: string;
  readonly type?: string;
  readonly path?: string;
  readonly url?: string;
  readonly command?: string;
  readonly contexts?: readonly string[];
  readonly notes?: string;
  readonly test_case?: string;
  readonly [key: string]: unknown;
}

export interface QualityMapExpectationInput {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly source_type?: string;
  readonly structure_provenance?: string;
  readonly source_refs?: readonly QualityMapSourceRefInput[];
  readonly category?: string;
  readonly priority?: string;
  readonly tasks?: readonly QualityMapTaskInput[];
  readonly policy_override?: QualityMapPolicyOverrideInput;
  readonly evidence?: readonly QualityMapEvidenceInput[];
  readonly proof_gap?: QualityMapProofGapInput;
  /**
   * Gap categories a human has reviewed and accepted as tolerated risk for this
   * check (e.g. `["weak", "manual-only"]`). An accepted gap is still surfaced but
   * no longer counts as an open gap and no longer drags the quality/coverage score.
   */
  readonly accepted_gaps?: readonly string[];
  readonly [key: string]: unknown;
}

export interface QualityMapDocument {
  readonly target?: QualityMapTargetInput;
  readonly expectations?: readonly QualityMapExpectationInput[];
  readonly structure_provenance?: string;
  readonly checks_reviewed?: boolean;
  readonly [key: string]: unknown;
}

export interface ParsedQualityMap {
  readonly source: QualityMapSource;
  readonly status: QualityMapParseStepStatus;
  readonly rawText: string;
  readonly rawDocument?: QualityMapDocument;
  readonly diagnostics: readonly QualityMapDiagnostic[];
}

export interface InvalidQualityMapEntityIds {
  readonly expectations: readonly string[];
  readonly tasks: readonly string[];
  readonly evidence: readonly string[];
}

export interface QualityMapValidationResult {
  readonly source: QualityMapSource;
  readonly status: QualityMapGraphStatus;
  readonly rawText: string;
  readonly document?: QualityMapDocument;
  readonly invalidEntityIds: InvalidQualityMapEntityIds;
  readonly diagnostics: readonly QualityMapDiagnostic[];
}

export interface NormalizedQualityMapRecord {
  readonly normalizedId: string;
  readonly localId: string;
  readonly sourceAttribution: QualityMapSourceAttribution;
}

export interface NormalizedQualityTarget extends NormalizedQualityMapRecord {
  readonly name: string;
  readonly scope?: string;
  readonly aliases: readonly string[];
}

export interface NormalizedSourceReference extends NormalizedQualityMapRecord {
  readonly path?: string;
  readonly url?: string;
  readonly label?: string;
  readonly anchor?: string;
}

export interface NormalizedPolicyOverride {
  readonly preferredModalities: readonly string[];
  readonly discouragedModalities: readonly string[];
  readonly requiredModalities: readonly string[];
  readonly requiredContexts: readonly string[];
  readonly requireGate: boolean;
  readonly notes?: string;
}

export interface NormalizedExpectation extends NormalizedQualityMapRecord {
  readonly title: string;
  readonly description?: string;
  readonly sourceType?: string;
  readonly structureProvenance: StructureProvenance;
  readonly category?: string;
  readonly priority?: string;
  readonly linkedTaskIds: readonly string[];
  readonly linkedEvidenceIds: readonly string[];
  readonly residualRiskIds: readonly string[];
  readonly policyOverride?: NormalizedPolicyOverride;
  /** Gap categories accepted as tolerated risk by a human reviewer (see `accepted_gaps`). */
  readonly acceptedGaps: readonly string[];
  readonly proofGapNextStep?: string | null;
}

export interface NormalizedTask extends NormalizedQualityMapRecord {
  readonly path?: string;
  readonly status?: string;
  readonly title?: string;
  readonly expectationId: string;
}

export interface NormalizedEvidenceEntry extends NormalizedQualityMapRecord {
  readonly type: string;
  readonly path?: string;
  readonly testCase?: string;
  readonly url?: string;
  readonly command?: string;
  readonly contexts: readonly string[];
  readonly notes?: string;
  readonly expectationId: string;
}

export interface NormalizedResidualRisk extends NormalizedQualityMapRecord {
  readonly text: string;
  readonly expectationId: string;
}

export interface NormalizedQualityGraph {
  readonly source: QualityMapSource;
  readonly target: NormalizedQualityTarget;
  readonly sourceRefs: readonly NormalizedSourceReference[];
  readonly expectations: readonly NormalizedExpectation[];
  readonly tasks: readonly NormalizedTask[];
  readonly evidence: readonly NormalizedEvidenceEntry[];
  readonly residualRisks: readonly NormalizedResidualRisk[];
  // Gate 4: a human reviewed and approved this check list. Combined with the
  // feature-confirmation gate (gate 2), drives the reviewed→HIGH structure score.
  readonly checksReviewed: boolean;
}

export interface NormalizedQualityGraphResult {
  readonly source: QualityMapSource;
  readonly status: QualityMapGraphStatus;
  readonly document?: QualityMapDocument;
  readonly graph?: NormalizedQualityGraph;
  readonly diagnostics: readonly QualityMapDiagnostic[];
}

export interface QualityMapParseBatch {
  readonly results: readonly NormalizedQualityGraphResult[];
  readonly diagnostics: readonly QualityMapDiagnostic[];
}
