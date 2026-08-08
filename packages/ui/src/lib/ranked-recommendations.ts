export interface RankedRecommendationRecord {
  readonly rank: number;
  readonly recommendation_id: string;
  readonly target_id: string;
  readonly target_name: string;
  readonly expectation_id: string;
  readonly expectation_local_id: string;
  readonly expectation_title: string;
  readonly quality_map_path: string;
  readonly observed_state: string;
  readonly score_lift: number;
  readonly current_score: number;
  readonly projected_score: number;
  readonly priority_weight: number;
  readonly priority?: string;
  readonly structural_status: string;
  readonly evidence_confidence: string;
  readonly structure_confidence: string;
  readonly structure_provenance: string;
  readonly reason: string;
  readonly next_action: string;
  readonly proof_source_paths: readonly string[];
  readonly verification_commands: readonly string[];
  readonly prompt_source: "canonical" | "fallback";
  readonly prompt: string;
}

export interface RecommendationScope {
  readonly kind: "whole-project" | "view";
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface RecommendationProfileRecord {
  readonly profile_id: string;
  readonly profile_name: string;
  readonly status: string;
  readonly transport: string;
  readonly run_id?: number;
  readonly run_url?: string;
  readonly commit?: string;
  readonly branch?: string;
  readonly observed_at?: string;
}

export interface QualityScoreAvailabilityRecord {
  readonly status: "available" | "not_requested" | "unavailable";
  readonly reason?: string;
}

export interface RecommendationExportFile {
  readonly schema_version: "6";
  readonly generated_at: string;
  readonly project_path: string;
  readonly project_root: string;
  // Absent when the export was generated without an observation set.
  readonly observation_set_id?: string;
  readonly observation_set_name?: string;
  readonly scope: RecommendationScope;
  readonly quality_score_availability: QualityScoreAvailabilityRecord;
  // Absent when the export was generated without an observation set.
  readonly runtime_review?: {
    readonly execution_status: string;
    readonly resolution_status: string;
    readonly observation_count: number;
    readonly resolved_commit?: string;
    readonly evaluated_target_count: number;
    readonly evaluated_expectation_count: number;
    readonly quality_score?: number;
    readonly basis?: string;
    readonly profiles: readonly RecommendationProfileRecord[];
    readonly execution_diagnostics: readonly {
      readonly code: string;
      readonly message: string;
      readonly severity: string;
      readonly details?: string;
    }[];
    readonly resolution_diagnostics: readonly {
      readonly code: string;
      readonly message: string;
      readonly severity: string;
      readonly details?: string;
    }[];
  };
  readonly recommendations: readonly RankedRecommendationRecord[];
}

export interface GenerateRecommendationsResponse {
  readonly path: string;
  readonly file: RecommendationExportFile;
}
