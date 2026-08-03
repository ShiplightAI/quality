import type {
  ParsedProjectMapDocument,
  ProjectMapFeature,
  ProjectMapPriorityProvenance
} from "./types";

export interface OrphanedDecision {
  readonly kind: "feature";
  readonly id: string;
  readonly reason: string;
  readonly preserved: {
    readonly status: string;
    readonly priority?: string;
    readonly priorityProvenance: ProjectMapPriorityProvenance;
  };
}

export interface PriorityConflict {
  readonly featureId: string;
  readonly humanPriority?: string;
  readonly agentProposedPriority: string;
}

export interface MergeProjectMapResult {
  readonly map: ParsedProjectMapDocument;
  readonly orphaned: readonly OrphanedDecision[];
  readonly conflicts: readonly PriorityConflict[];
}

function carriesHumanDecision(feature: ProjectMapFeature): boolean {
  return feature.status !== "candidate" || feature.priorityProvenance === "human";
}

/**
 * Merge a freshly scanned project map with the existing one, preserving human
 * decisions held in the old map's nodes (FR-011/FR-012):
 *
 * - Ratification: a non-`candidate` (ratified) prior status is kept even if the
 *   scan re-proposes `candidate` — ratification does not decay.
 * - Priority: a `human`-set prior priority is kept; if the scan proposes a
 *   different value, that is surfaced as a conflict (FR-008), never applied.
 * - Orphans: a prior feature carrying a human decision that the scan no longer
 *   produces is dropped from `map.features` but always surfaced in `orphaned`
 *   (never silently discarded) so the human decision is not lost (FR-014).
 *
 * Pure function — no IO. The agent-side construction (scanning, writing) is the
 * `quality-project` skill's job; this is the shared merge it relies on.
 */
export function mergeProjectMap(
  oldMap: ParsedProjectMapDocument,
  scanned: ParsedProjectMapDocument
): MergeProjectMapResult {
  const priorById = new Map(oldMap.features.map((feature) => [feature.id, feature]));
  const conflicts: PriorityConflict[] = [];

  const features: ProjectMapFeature[] = scanned.features.map((scannedFeature) => {
    const prior = priorById.get(scannedFeature.id);
    if (prior === undefined) {
      return scannedFeature;
    }

    // Ratification does not decay: keep a ratified (non-candidate) prior status.
    const status = prior.status !== "candidate" ? prior.status : scannedFeature.status;

    if (prior.priorityProvenance === "human") {
      if (scannedFeature.priority !== undefined && scannedFeature.priority !== prior.priority) {
        conflicts.push({
          featureId: scannedFeature.id,
          humanPriority: prior.priority,
          agentProposedPriority: scannedFeature.priority
        });
      }
      return {
        ...scannedFeature,
        status,
        priority: prior.priority,
        priorityProvenance: "human"
      };
    }

    return { ...scannedFeature, status };
  });

  const scannedIds = new Set(scanned.features.map((feature) => feature.id));
  const orphaned: OrphanedDecision[] = oldMap.features
    .filter((feature) => !scannedIds.has(feature.id) && carriesHumanDecision(feature))
    .map((feature) => ({
      kind: "feature",
      id: feature.id,
      reason: "Feature is no longer produced by the scan but carried a human decision.",
      preserved: {
        status: feature.status,
        priority: feature.priority,
        priorityProvenance: feature.priorityProvenance
      }
    }));

  return { map: { ...scanned, features }, orphaned, conflicts };
}
