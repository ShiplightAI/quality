import type {
  QcExecuteObservationSetInput,
  QcExecuteObservationSetResult,
  QcExecuteObservationSourceInput,
  QcExecuteObservationSourceResult,
  QcFixPromptInput,
  QcMarkdownArtifact,
  QcRecommendationsInput,
  QcRecommendationsResult,
  QcSaveFeaturesInput,
  QcSaveFeaturesResult,
  QcSaveObservationSetsInput,
  QcSaveObservationSetsResult,
  QcSaveObservationSourcesInput,
  QcSaveObservationSourcesResult,
  QcSaveQualityMapInput,
  QcSaveQualityMapResult,
  QcSaveSourcesInput,
  QcSaveSourcesResult,
  QcSaveViewsInput,
  QcSaveViewsResult,
  QcScanInput,
  QcScanResult,
} from "@shiplightai/quality-core/operations";

// Sync state of a hosted target's worktree (spec 045 draft-preview-publish-refinement).
// Drives the "behind by N" hint + Publish/Discard affordances. Mirrors the `qc serve`
// QcSyncStatus response; hosted-only (local mode has no origin to sync with).
export interface QcSyncStatus {
  readonly base: string;
  readonly baseMoved: boolean;
  readonly behind: number;
  readonly hasDraft: boolean;
  readonly draftPublished: boolean;
  readonly prNumber?: number;
  readonly prUrl?: string;
}

export interface QcPublishResult {
  readonly prNumber: number;
  readonly prUrl: string;
}

// The data operations the QC UI needs, behind one interface (spec 045). Two impls
// sit behind it: LocalFsDataAccess (core ops over a local projectPath) and — slice 2 —
// HostedVmDataAccess (HTTP client to `qc serve`). The op input/result types live with
// the shared ops in @shiplightai/quality-core/operations.
export interface QcDataAccess {
  scan(input: QcScanInput): Promise<QcScanResult>;
  getRecommendations(input: QcRecommendationsInput): Promise<QcRecommendationsResult>;
  readMarkdownArtifact(projectPath: string, artifactPath: string): Promise<QcMarkdownArtifact>;
  getFixPrompt(input: QcFixPromptInput): Promise<{ readonly prompt: string }>;
  saveFeatures(input: QcSaveFeaturesInput): Promise<QcSaveFeaturesResult>;
  saveSources(input: QcSaveSourcesInput): Promise<QcSaveSourcesResult>;
  saveQualityMap(input: QcSaveQualityMapInput): Promise<QcSaveQualityMapResult>;
  saveObservationSets(input: QcSaveObservationSetsInput): Promise<QcSaveObservationSetsResult>;
  saveObservationSources(input: QcSaveObservationSourcesInput): Promise<QcSaveObservationSourcesResult>;
  saveViews(input: QcSaveViewsInput): Promise<QcSaveViewsResult>;
  executeObservationSet(input: QcExecuteObservationSetInput): Promise<QcExecuteObservationSetResult>;
  executeObservationSource(input: QcExecuteObservationSourceInput): Promise<QcExecuteObservationSourceResult>;
  // Draft/preview/publish sync ops (hosted only). Refresh = pull; Publish = open/update the PR;
  // Discard = drop the draft. `syncStatus` reports behind-count + draft/PR state.
  syncStatus(): Promise<QcSyncStatus>;
  pull(input: { readonly rebaseDraft?: boolean }): Promise<QcSyncStatus>;
  publish(): Promise<QcPublishResult>;
  discard(): Promise<{ readonly ok: true }>;
}
