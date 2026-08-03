import type { ArtifactKind } from "./types";

export interface SupportedArtifactPattern {
  readonly sourcePattern: string;
  readonly parentPattern:
    | ".quality"
    | ".quality/config"
    | ".quality/evidence/*"
    | "specs/*";
  readonly fileName: string;
  readonly kind: ArtifactKind;
}

// The quality backbone lives under .quality/: the project index at
// the top, per-feature quality maps under evidence/, and runtime-review wiring
// under config/. Dev-bundle artifacts (test-spec / test-report) stay in specs/.
export const supportedArtifactPatterns = [
  {
    sourcePattern: ".quality/project-map.yaml",
    parentPattern: ".quality",
    fileName: "project-map.yaml",
    kind: "project_map"
  },
  {
    sourcePattern: ".quality/config/views.yaml",
    parentPattern: ".quality/config",
    fileName: "views.yaml",
    kind: "views"
  },
  {
    sourcePattern: ".quality/config/observation-sources.yaml",
    parentPattern: ".quality/config",
    fileName: "observation-sources.yaml",
    kind: "observation_sources"
  },
  {
    sourcePattern: ".quality/config/observation-sets.yaml",
    parentPattern: ".quality/config",
    fileName: "observation-sets.yaml",
    kind: "observation_sets"
  },
  {
    sourcePattern: ".quality/evidence/*/quality-map.yaml",
    parentPattern: ".quality/evidence/*",
    fileName: "quality-map.yaml",
    kind: "quality_map"
  },
  {
    sourcePattern: "specs/*/test-spec.md",
    parentPattern: "specs/*",
    fileName: "test-spec.md",
    kind: "test_spec"
  },
  {
    sourcePattern: "specs/*/test-report.md",
    parentPattern: "specs/*",
    fileName: "test-report.md",
    kind: "test_report"
  }
] as const satisfies readonly SupportedArtifactPattern[];

export function qualityMapEvidenceRoots(): readonly string[] {
  return [...new Set(
    supportedArtifactPatterns
      .filter((pattern) => pattern.kind === "quality_map")
      .map((pattern) => pattern.sourcePattern.split("/*/")[0]!)
  )];
}

export const supportedArtifactFileNames = [
  "project-map.yaml",
  "views.yaml",
  "observation-sources.yaml",
  "observation-sets.yaml",
  "quality-map.yaml",
  "test-spec.md",
  "test-report.md"
] as const;
