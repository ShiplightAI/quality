import { isMap, isScalar, isSeq, parseDocument, YAMLMap, YAMLSeq, type YAMLMap as YAMLMapType } from "yaml";

export interface QualityCheckPolicyEdit {
  readonly id: string; // expectation id (YAML `id`)
  readonly requireGate?: boolean;
}

export interface QualityGapAcceptanceEdit {
  readonly id: string; // expectation id (YAML `id`)
  readonly category: string; // gap category to accept / un-accept (e.g. "weak")
  readonly accepted: boolean; // true to accept as tolerated risk, false to un-accept
}

export interface QualityCheckAddition {
  readonly id: string; // new expectation id (YAML `id`)
  readonly title: string;
  readonly priority?: string;
}

export interface QualityMapEdits {
  /**
   * Gate 4: record that a human reviewed and approved the check list, by setting
   * the map-level `checks_reviewed` flag. Orthogonal to each check's
   * `structure_provenance` (its origin), which review never overwrites.
   */
  readonly reviewCheckList?: boolean;
  /** Gate 4 curation: append human-authored checks the agent missed. */
  readonly addExpectations?: readonly QualityCheckAddition[];
  /** Gate 4 curation: drop checks that don't belong, by expectation id. */
  readonly removeExpectationIds?: readonly string[];
  /** Gate 5: per-check proof-policy edits. */
  readonly policyEdits?: readonly QualityCheckPolicyEdit[];
  /** Per-gap accepted-risk decisions: accept (or un-accept) a gap category on a check. */
  readonly gapAcceptanceEdits?: readonly QualityGapAcceptanceEdit[];
}

export interface ApplyQualityMapEditsResult {
  readonly text: string;
  readonly updated: readonly string[];
  readonly unknownIds: readonly string[];
}

/**
 * Apply gate-4 (map-level `checks_reviewed`, add/remove checks) and gate-5
 * (per-check `policy_override`) edits to a raw quality-map YAML string, preserving
 * comments and unrelated formatting by mutating the parsed document in place.
 * Unknown expectation ids are returned in `unknownIds`, not applied.
 *
 * Edit order is: checks_reviewed, then removals, then additions, then policy, then
 * gap acceptance.
 * Because removals run before the addition dedup check, a caller MUST NOT list the
 * same id in both `removeExpectationIds` and `addExpectations` (the API route
 * rejects that with a 400); doing so would remove then re-add the id rather than
 * being caught as a duplicate.
 */
export function applyQualityMapEdits(
  rawText: string,
  edits: QualityMapEdits
): ApplyQualityMapEditsResult {
  const doc = parseDocument(rawText);
  const updated: string[] = [];
  const unknownIds: string[] = [];

  if (edits.reviewCheckList === true) {
    doc.set("checks_reviewed", true);
    updated.push("map");
  }

  let expectations = doc.get("expectations");

  // Curation: drop checks that don't belong (unknown ids are reported, not applied).
  // Dedupe so a repeated id isn't reported twice in `updated`.
  const removeIds = [...new Set(edits.removeExpectationIds ?? [])];
  if (removeIds.length > 0) {
    const existingIds = new Set(
      isSeq(expectations)
        ? expectations.items.flatMap((item) => (isMap(item) && typeof item.get("id") === "string" ? [item.get("id") as string] : []))
        : []
    );
    for (const id of removeIds) {
      if (!existingIds.has(id)) {
        unknownIds.push(id);
      }
    }
    if (isSeq(expectations)) {
      const removeSet = new Set<string>(removeIds);
      expectations.items = expectations.items.filter(
        (item) => !(isMap(item) && typeof item.get("id") === "string" && removeSet.has(item.get("id") as string))
      );
      for (const id of removeIds) {
        if (existingIds.has(id)) {
          updated.push(id);
        }
      }
    }
  }

  // Curation: append human-authored checks. A human adding a check IS the
  // provenance, so stamp each new check `user_authored` explicitly rather than
  // letting it inherit the map default (which could still be agent_generated).
  const additions = edits.addExpectations ?? [];
  if (additions.length > 0) {
    if (!isSeq(expectations)) {
      expectations = new YAMLSeq();
      doc.set("expectations", expectations);
    }
    // Guard against duplicate ids (within the batch or colliding with an existing
    // check) so we never write a map with two checks sharing an id.
    const presentIds = new Set(
      (expectations as YAMLSeq).items.flatMap((item) =>
        isMap(item) && typeof item.get("id") === "string" ? [item.get("id") as string] : []
      )
    );
    for (const addition of additions) {
      if (presentIds.has(addition.id)) {
        unknownIds.push(addition.id);
        continue;
      }
      presentIds.add(addition.id);
      const node = new YAMLMap();
      node.set("id", addition.id);
      node.set("title", addition.title);
      if (addition.priority !== undefined) {
        node.set("priority", addition.priority);
      }
      node.set("structure_provenance", "user_authored");
      (expectations as YAMLSeq).add(node);
      updated.push(addition.id);
    }
  }

  for (const edit of edits.policyEdits ?? []) {
    const node = isSeq(expectations)
      ? expectations.items.find((item): item is YAMLMapType => isMap(item) && item.get("id") === edit.id)
      : undefined;

    if (node === undefined) {
      unknownIds.push(edit.id);
      continue;
    }

    const existing = node.get("policy_override", true);
    const policy = isMap(existing) ? existing : new YAMLMap();
    if (!isMap(existing)) {
      node.set("policy_override", policy);
    }
    if (edit.requireGate !== undefined) {
      policy.set("require_gate", edit.requireGate);
    }
    updated.push(edit.id);
  }

  // Per-gap accepted-risk decisions: maintain each check's `accepted_gaps` sequence
  // (the gap categories a human has signed off as tolerated risk).
  for (const edit of edits.gapAcceptanceEdits ?? []) {
    const node = isSeq(expectations)
      ? expectations.items.find((item): item is YAMLMapType => isMap(item) && item.get("id") === edit.id)
      : undefined;

    if (node === undefined) {
      unknownIds.push(edit.id);
      continue;
    }

    const existing = node.get("accepted_gaps", true);
    // Read the current categories as plain strings (scalar nodes → their value).
    const categories = new Set<string>(
      isSeq(existing)
        ? existing.items.flatMap((item) => {
            const value = isScalar(item) ? item.value : item;
            return typeof value === "string" ? [value] : [];
          })
        : []
    );
    if (edit.accepted) {
      categories.add(edit.category);
    } else {
      categories.delete(edit.category);
    }

    if (categories.size === 0) {
      if (existing !== undefined) {
        node.delete("accepted_gaps");
      }
    } else {
      const seq = new YAMLSeq();
      for (const category of categories) {
        seq.add(category);
      }
      node.set("accepted_gaps", seq);
    }
    updated.push(edit.id);
  }

  return { text: doc.toString(), updated, unknownIds };
}
