import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseHumanSources } from "../../packages/core/src/sources/parse";
import type { HumanSourcesSource } from "../../packages/core/src/sources/types";

let dir: string;

function sourceFor(file: string): HumanSourcesSource {
  return {
    projectRelativePath: ".quality/config/sources.yaml",
    resolvedLocalPath: path.join(dir, file)
  };
}

async function write(file: string, yaml: string): Promise<HumanSourcesSource> {
  await writeFile(path.join(dir, file), yaml, "utf8");
  return sourceFor(file);
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qc-sources-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("parseHumanSources", () => {
  it("parses a valid sources file", async () => {
    const source = await write(
      "sources.yaml",
      [
        "sources:",
        "  - key: docs/prd.md",
        "    kind: doc",
        "    origin: agent",
        "    status: current",
        "  - key: jira:PROJ-1",
        "    kind: tracker_query",
        "    origin: human",
        "    status: current"
      ].join("\n")
    );

    const parsed = parseHumanSources(source);

    expect(parsed.status).toBe("parsed");
    expect(parsed.document?.sources).toHaveLength(2);
    expect(parsed.document?.sources[1]).toMatchObject({ key: "jira:PROJ-1", origin: "human", kind: "tracker_query" });
    expect(parsed.diagnostics).toHaveLength(0);
  });

  it("reports a duplicate-key diagnostic and keeps the first entry", async () => {
    const source = await write(
      "sources.yaml",
      ["sources:", "  - key: a", "    status: current", "  - key: a", "    status: stale"].join("\n")
    );

    const parsed = parseHumanSources(source);

    expect(parsed.document?.sources).toHaveLength(1);
    expect(parsed.diagnostics.map((d) => d.code)).toContain("DUPLICATE_SOURCE_KEY");
  });

  it("flags a superseded source whose superseded_by is dangling", async () => {
    const source = await write(
      "sources.yaml",
      ["sources:", "  - key: old.md", "    status: superseded", "    superseded_by: missing.md"].join("\n")
    );

    const parsed = parseHumanSources(source);

    expect(parsed.diagnostics.map((d) => d.code)).toContain("DANGLING_SUPERSEDED_BY");
  });

  it("treats a missing file as an empty document (the layer is optional)", () => {
    const parsed = parseHumanSources(sourceFor("does-not-exist.yaml"));

    expect(parsed.status).toBe("parsed");
    expect(parsed.document?.sources).toHaveLength(0);
    expect(parsed.diagnostics).toHaveLength(0);
  });
});
