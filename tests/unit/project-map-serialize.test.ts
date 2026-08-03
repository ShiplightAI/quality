import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { applyFeatureEdits } from "../../packages/core/src/project-map/serialize";

const RAW = [
  "# project map",
  "project:",
  "  id: p",
  "features:",
  "  - id: 001-a",
  "    name: A",
  "    status: candidate",
  "    priority: P2",
  "  - id: 002-b",
  "    name: B",
  "    status: candidate",
  ""
].join("\n");

describe("applyFeatureEdits", () => {
  it("ratifies a feature (status edit) and preserves the comment/other nodes", () => {
    const result = applyFeatureEdits(RAW, [{ id: "001-a", status: "active" }]);

    expect(result.updated).toEqual(["001-a"]);
    expect(result.text).toContain("# project map");
    const doc = parseDocument(result.text).toJSON() as { features: Array<Record<string, unknown>> };
    expect(doc.features[0]).toMatchObject({ id: "001-a", status: "active" });
    expect(doc.features[1]).toMatchObject({ id: "002-b", status: "candidate" });
  });

  it("stamps priority_provenance=human on any priority edit", () => {
    const result = applyFeatureEdits(RAW, [{ id: "002-b", priority: "P0" }]);

    const doc = parseDocument(result.text).toJSON() as { features: Array<Record<string, unknown>> };
    expect(doc.features[1]).toMatchObject({ id: "002-b", priority: "P0", priority_provenance: "human" });
  });

  it("preserves an existing priority_provenance: human across an unrelated status edit", () => {
    const withHumanPriority = [
      "project:",
      "  id: p",
      "features:",
      "  - id: 001-a",
      "    name: A",
      "    status: candidate",
      "    priority: P0",
      "    priority_provenance: human",
      ""
    ].join("\n");
    // A status-only edit must not drop the human priority stamp (round-trip safe).
    const result = applyFeatureEdits(withHumanPriority, [{ id: "001-a", status: "active" }]);

    const doc = parseDocument(result.text).toJSON() as { features: Array<Record<string, unknown>> };
    expect(doc.features[0]).toMatchObject({ id: "001-a", status: "active", priority_provenance: "human" });
  });

  it("reports unknown ids without applying them", () => {
    const result = applyFeatureEdits(RAW, [{ id: "999-x", status: "active" }]);

    expect(result.unknownIds).toEqual(["999-x"]);
    expect(result.updated).toEqual([]);
  });
});
