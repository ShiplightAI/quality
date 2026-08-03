import { stringify } from "yaml";
import type { HumanSource } from "./types";

/**
 * Serialize the human-sources layer back to YAML. Mirrors the verdict vocabulary
 * in the data model; omits optional fields when empty to keep the file clean.
 */
export function serializeHumanSources(sources: readonly HumanSource[]): string {
  return stringify({
    sources: sources.map((entry) => ({
      key: entry.key,
      kind: entry.kind,
      origin: entry.origin,
      status: entry.status,
      ...(entry.supersededBy === undefined ? {} : { superseded_by: entry.supersededBy }),
      ...(entry.label === undefined ? {} : { label: entry.label }),
      ...(entry.note === undefined ? {} : { note: entry.note })
    }))
  });
}
