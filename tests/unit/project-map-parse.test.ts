import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseProjectMap } from "../../packages/core/src/project-map/parse";
import type { ProjectMapSource } from "../../packages/core/src/project-map/types";

let dir: string;

async function write(yaml: string): Promise<ProjectMapSource> {
  const file = path.join(dir, "project-map.yaml");
  await writeFile(file, yaml, "utf8");
  return {
    projectRelativePath: ".quality/project-map.yaml",
    resolvedLocalPath: file
  };
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qc-project-map-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("parseProjectMap", () => {
  it("exposes authored product documents", async () => {
    const source = await write(
      [
        "project:",
        '  id: "demo"',
        '  name: "Demo"',
        "product_docs:",
        '  - id: "prd"',
        '    path: "docs/prd.md"',
        '    role: "accepted_requirements"',
        "features:",
        '  - id: "001-engine"',
        '    name: "Engine"',
        '    status: "implemented"'
      ].join("\n")
    );

    const parsed = parseProjectMap(source);

    expect(parsed.status).toBe("parsed");
    expect(parsed.map?.productDocs).toEqual([{ path: "docs/prd.md", label: "accepted_requirements" }]);
  });

  it("reads feature order from the top level", async () => {
    const source = await write(
      [
        "project:",
        '  id: "demo"',
        '  name: "Demo"',
        "feature_order:",
        '  - "002-second"',
        '  - "001-first"',
        "features:",
        '  - id: "001-first"',
        '    name: "First"',
        '  - id: "002-second"',
        '    name: "Second"'
      ].join("\n")
    );

    const parsed = parseProjectMap(source);

    expect(parsed.status).toBe("parsed");
    expect(parsed.map?.featureOrder).toEqual(["002-second", "001-first"]);
  });

  it("carries no roadmap concept", async () => {
    // The quality graph holds features, checks, and proof. Ordering is a
    // top-level concern; roadmap, milestone, and release grouping belong in the
    // planning documents referenced by `product_docs`. A `roadmap:` block is
    // therefore inert — reading it back would revive the grouping the graph
    // deliberately does not model.
    const source = await write(
      [
        "project:",
        '  id: "demo"',
        '  name: "Demo"',
        "roadmap:",
        '  current_milestone: "001-engine"',
        "  feature_order:",
        '    - "001-engine"',
        "features:",
        '  - id: "001-engine"',
        '    name: "Engine"'
      ].join("\n")
    );

    const parsed = parseProjectMap(source);

    expect(parsed.status).toBe("parsed");
    expect(parsed.map).not.toHaveProperty("currentMilestone");
    expect(parsed.map?.featureOrder).toEqual([]);
    // Inert, but not silent. A map written against the old shape loses its
    // index ordering; without this warning the list just reorders and the
    // author has nothing to explain it.
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({ severity: "warning", code: "LEGACY_ROADMAP_BLOCK" })
    ]);
  });

  it("does not carry a release-area grouping", async () => {
    // Reusable assessment scopes are `.quality/config/views.yaml`. A second
    // grouping inside the project map was parsed into the document but never
    // read by any consumer, so an author could declare release areas and see
    // nothing happen. Parsing it back would revive that silent no-op.
    const source = await write(
      [
        "project:",
        '  id: "demo"',
        '  name: "Demo"',
        "roadmap:",
        "  release_areas:",
        '    - id: "cli"',
        '      name: "CLI"',
        "      feature_ids:",
        '        - "001-engine"',
        "features:",
        '  - id: "001-engine"',
        '    name: "Engine"',
        '    status: "implemented"'
      ].join("\n")
    );

    const parsed = parseProjectMap(source);

    expect(parsed.status).toBe("parsed");
    expect(parsed.map).not.toHaveProperty("releaseAreas");
    expect(parsed.map?.features.map((feature) => feature.id)).toEqual(["001-engine"]);
  });
});
