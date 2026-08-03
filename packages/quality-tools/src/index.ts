export {
  buildRecommendationExport,
  collectFixPrompts,
  fixPromptsOutputPath,
  generateFixPrompts,
  recommendationExportOutputPath,
  renderFixPromptsMarkdown,
  type BuildRecommendationExportInput,
  type FixPromptRecord,
  type GenerateFixPromptsInput,
  type GenerateFixPromptsResult,
  type RecommendationExportBuildResult,
  type RecommendationExportFile,
  type RecommendationFixPromptRecord,
  type RecommendationProfileRecord,
  type RecommendationScope,
  type RankedRecommendationRecord
} from "@shiplightai/quality-core";
export {
  QUALITY_OBSERVATION_SCHEMA_VERSION,
  buildQualityObservationManifestJsonSchema,
  ingestObservationManifest,
  parseQualityObservationManifest,
  serializeQualityObservationManifest,
  serializeQualityObservationManifestJsonSchema,
  type QualityObservationManifest,
  type QualityObservationManifestParseResult,
  type QualityObservationManifestRecord,
  type QualityObservationManifestRevision,
  type QualityObservationManifestRun
} from "@shiplightai/quality-core";
// The quality-map contract, re-exported so consumers use one published package for both the CLI
// and the library: the validator (the authoritative contract), the schema emitter, and the
// vocabulary. Bundled by tsup (noExternal), so no separate published package is needed.
export {
  GAP_CATEGORIES,
  buildQualityMapJsonSchema,
  parseQualityMap,
  parseQualityMaps,
  serializeQualityMapJsonSchema,
  validateQualityMap,
  type GapCategory,
  type JsonSchema,
  type ParsedQualityMap,
  type QualityMapDiagnostic,
  type QualityMapDocument,
  type QualityMapSource,
  type QualityMapValidationResult
} from "@shiplightai/quality-map";
export * from "./commands/result";
