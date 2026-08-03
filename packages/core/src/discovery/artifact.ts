import path from "node:path";
import type { ArtifactKind, DiscoveredArtifact } from "./types";

export function classifyArtifact(fileName: string): ArtifactKind | null {
  if (fileName === "project-map.yaml") {
    return "project_map";
  }

  if (fileName === "observation-sources.yaml") {
    return "observation_sources";
  }

  if (fileName === "views.yaml") {
    return "views";
  }

  if (fileName === "observation-sets.yaml") {
    return "observation_sets";
  }

  if (fileName === "quality-map.yaml") {
    return "quality_map";
  }

  if (fileName === "test-spec.md") {
    return "test_spec";
  }

  if (fileName === "test-report.md") {
    return "test_report";
  }

  return null;
}

export function createArtifactId(kind: ArtifactKind, projectRelativePath: string): string {
  return `${kind}:${projectRelativePath}`;
}

export function targetLocationForArtifact(projectRelativePath: string): string {
  return path.posix.dirname(projectRelativePath);
}

export function createDiscoveredArtifact(input: {
  readonly kind: ArtifactKind;
  readonly projectRelativePath: string;
  readonly resolvedPath: string;
  readonly sourcePattern: string;
}): DiscoveredArtifact {
  const targetLocation = targetLocationForArtifact(input.projectRelativePath);

  return {
    id: createArtifactId(input.kind, input.projectRelativePath),
    kind: input.kind,
    projectRelativePath: input.projectRelativePath,
    originalPath: input.projectRelativePath,
    resolvedPath: input.resolvedPath,
    targetLocation,
    sourcePattern: input.sourcePattern
  };
}
