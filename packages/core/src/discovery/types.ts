import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import type { ObservationSetParseBatch } from "../observation-sets/types";
import type { QualityMapParseBatch } from "@shiplightai/quality-map";
import type { MarkdownFallbackBatch } from "../markdown-fallback/types";
import type { ObservationSourceProfileParseBatch } from "../observation-sources/types";
import type { ProjectMapParseBatch } from "../project-map/types";
import type { HumanSourcesBatch } from "../sources/types";
import type { SavedQcViewParseBatch } from "../views/types";

export type ArtifactKind =
  | "project_map"
  | "quality_map"
  | "test_spec"
  | "test_report"
  | "observation_sources"
  | "observation_sets"
  | "views";

export type ScanStatus = "completed" | "partial" | "failed";

export type TargetValidationStatus = "valid" | "invalid";

export type ScanMode = "scan" | "refresh";

export interface ProjectScanTarget {
  readonly inputPath: string;
  readonly resolvedPath: string;
  readonly displayName: string;
  readonly validationStatus: TargetValidationStatus;
  readonly validationDiagnostic?: ScanDiagnostic;
}

export interface DiscoveredArtifact {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly projectRelativePath: string;
  readonly originalPath: string;
  readonly resolvedPath: string;
  readonly targetLocation: string;
  readonly sourcePattern: string;
}

export type TargetScopeHint = "project" | "feature" | "unknown";

export interface TargetCandidate {
  readonly id: string;
  readonly label: string;
  readonly scopeHint: TargetScopeHint;
  readonly artifactIds: readonly string[];
}

export interface ScanResult {
  readonly status: ScanStatus;
  readonly target: ProjectScanTarget;
  readonly artifacts: readonly DiscoveredArtifact[];
  readonly projectMaps: ProjectMapParseBatch;
  readonly views: SavedQcViewParseBatch;
  readonly sources: HumanSourcesBatch;
  readonly qualityMaps: QualityMapParseBatch;
  readonly observationSourceProfiles: ObservationSourceProfileParseBatch;
  readonly observationSets: ObservationSetParseBatch;
  readonly markdownFallback: MarkdownFallbackBatch;
  readonly targetCandidates: readonly TargetCandidate[];
  readonly diagnostics: readonly ScanDiagnostic[];
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface AppShellState {
  readonly pathInput: string;
  readonly isScanning: boolean;
  readonly currentResult?: ScanResult;
  readonly lastAttemptDiagnostic?: ScanDiagnostic;
}
