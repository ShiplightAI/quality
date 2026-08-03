import { stringify } from "yaml";
import type { ObservationSet } from "./types";

/**
 * Serialize observation sets back to `.quality/config/observation-sets.yaml`.
 * Mirrors the parser's expected shape (`observation_sets[].profiles[].profile_id`);
 * omits an empty description.
 */
export function serializeObservationSets(sets: readonly ObservationSet[]): string {
  return stringify({
    observation_sets: sets.map((set) => ({
      id: set.id,
      name: set.name,
      ...(set.description === undefined || set.description.length === 0 ? {} : { description: set.description }),
      profiles: set.profiles.map((profile) => ({ profile_id: profile.profileId }))
    }))
  });
}
