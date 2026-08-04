import { describe, expect, it } from "vitest";
import { mergeProjectMap } from "../../packages/core/src/project-map/merge";
import type {
  ParsedProjectMapDocument,
  ProjectMapFeature
} from "../../packages/core/src/project-map/types";

function feature(overrides: Partial<ProjectMapFeature> & { id: string }): ProjectMapFeature {
  return {
    name: overrides.id,
    status: "candidate",
    priorityProvenance: "agent",
    dependencies: [],
    artifacts: { checklistPaths: [] },
    codeRefs: [],
    evidenceRefs: [],
    openQuestions: [],
    residualRisks: [],
    ...overrides
  };
}

function map(features: readonly ProjectMapFeature[]): ParsedProjectMapDocument {
  return {
    project: { id: "p", name: "p", sourceRefs: [] },
    featureOrder: [],
    features,
    productDocs: [],
    crossFeatureConcerns: [],
    discovery: { evidenceGaps: [], unresolvedDrift: [] }
  };
}

describe("mergeProjectMap", () => {
  it("preserves ratification and human-set priority across a rebuild", () => {
    const oldMap = map([feature({ id: "001", status: "active", priority: "P0", priorityProvenance: "human" })]);
    const scanned = map([feature({ id: "001", status: "candidate", priority: "P2", priorityProvenance: "agent" })]);

    const result = mergeProjectMap(oldMap, scanned);

    const merged = result.map.features[0]!;
    expect(merged.status).toBe("active"); // ratification did not decay
    expect(merged.priority).toBe("P0"); // human priority kept
    expect(merged.priorityProvenance).toBe("human");
  });

  it("surfaces a conflict when the scan proposes a different priority than a human-set one", () => {
    const oldMap = map([feature({ id: "001", priority: "P0", priorityProvenance: "human" })]);
    const scanned = map([feature({ id: "001", priority: "P3", priorityProvenance: "agent" })]);

    const result = mergeProjectMap(oldMap, scanned);

    expect(result.conflicts).toEqual([
      { featureId: "001", humanPriority: "P0", agentProposedPriority: "P3" }
    ]);
    expect(result.map.features[0]!.priority).toBe("P0"); // human value kept until resolved
  });

  it("emits an orphan for a dropped feature that carried a human decision, never deleting it", () => {
    const oldMap = map([feature({ id: "001", status: "active", priority: "P1", priorityProvenance: "human" })]);
    const scanned = map([]); // scan no longer produces 001

    const result = mergeProjectMap(oldMap, scanned);

    expect(result.map.features).toHaveLength(0);
    expect(result.orphaned).toHaveLength(1);
    expect(result.orphaned[0]).toMatchObject({ kind: "feature", id: "001" });
    expect(result.orphaned[0]!.preserved.priorityProvenance).toBe("human");
  });

  it("does not orphan a dropped feature that carried no human decision", () => {
    const oldMap = map([feature({ id: "001", status: "candidate", priorityProvenance: "agent" })]);
    const scanned = map([]);

    const result = mergeProjectMap(oldMap, scanned);

    expect(result.orphaned).toHaveLength(0);
  });

  it("takes the scan's status and priority for an unratified candidate", () => {
    const oldMap = map([feature({ id: "001", status: "candidate", priority: "P2", priorityProvenance: "agent" })]);
    const scanned = map([feature({ id: "001", status: "candidate", priority: "P1", priorityProvenance: "agent" })]);

    const result = mergeProjectMap(oldMap, scanned);

    expect(result.map.features[0]!.priority).toBe("P1");
    expect(result.conflicts).toHaveLength(0);
  });
});
