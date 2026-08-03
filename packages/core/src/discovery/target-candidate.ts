import type { DiscoveredArtifact, TargetCandidate, TargetScopeHint } from "./types";

function scopeHintForLocation(targetLocation: string): TargetScopeHint {
  if (targetLocation === ".quality") {
    return "project";
  }

  if (
    targetLocation.startsWith(".quality/evidence/") ||
    targetLocation.startsWith("specs/")
  ) {
    return "feature";
  }

  return "unknown";
}

export function createTargetCandidates(
  artifacts: readonly DiscoveredArtifact[]
): readonly TargetCandidate[] {
  const grouped = new Map<string, string[]>();

  for (const artifact of artifacts) {
    if (
      artifact.kind === "observation_sources" ||
      artifact.kind === "observation_sets" ||
      artifact.kind === "views"
    ) {
      continue;
    }

    const artifactIds = grouped.get(artifact.targetLocation) ?? [];
    artifactIds.push(artifact.id);
    grouped.set(artifact.targetLocation, artifactIds);
  }

  return [...grouped.entries()]
    .map(([targetLocation, artifactIds]) => ({
      id: `${scopeHintForLocation(targetLocation)}:${targetLocation}`,
      label: targetLocation,
      scopeHint: scopeHintForLocation(targetLocation),
      artifactIds: artifactIds.toSorted()
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
}
