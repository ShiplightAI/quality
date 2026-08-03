import { isMap, isSeq, parseDocument, type YAMLMap } from "yaml";
import type { ProjectMapPriorityProvenance } from "./types";

export interface ProjectMapFeatureEdit {
  readonly id: string;
  readonly status?: string;
  readonly priority?: string;
}

export interface ApplyFeatureEditsResult {
  readonly text: string;
  readonly updated: readonly string[];
  readonly unknownIds: readonly string[];
}

/**
 * Apply ratification (`status`) and priority edits to feature nodes in a raw
 * project-map YAML string, preserving comments and unrelated formatting by
 * mutating the parsed document in place. Any `priority` edit also stamps
 * `priority_provenance: human` (FR-007). Unknown ids are returned, not applied.
 */
export function applyFeatureEdits(
  rawText: string,
  edits: readonly ProjectMapFeatureEdit[]
): ApplyFeatureEditsResult {
  const doc = parseDocument(rawText);
  const features = doc.get("features");
  const updated: string[] = [];
  const unknownIds: string[] = [];

  for (const edit of edits) {
    const node = isSeq(features)
      ? features.items.find((item): item is YAMLMap => isMap(item) && item.get("id") === edit.id)
      : undefined;

    if (node === undefined) {
      unknownIds.push(edit.id);
      continue;
    }

    if (edit.status !== undefined) {
      node.set("status", edit.status);
    }
    if (edit.priority !== undefined) {
      node.set("priority", edit.priority);
      const provenance: ProjectMapPriorityProvenance = "human";
      node.set("priority_provenance", provenance);
    }
    updated.push(edit.id);
  }

  return { text: doc.toString(), updated, unknownIds };
}
