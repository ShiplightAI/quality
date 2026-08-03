import { performance } from "node:perf_hooks";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseQualityMaps } from "@shiplightai/quality-map";
import { scanProject } from "@shiplightai/quality-core";
import {
  buildLargeQualityMap,
  fixtureQualityMapSource
} from "../fixtures/quality-map/build-fixtures";

describe("quality-map normalization integration", () => {
  it("normalizes 100 expectations and 500 evidence records within two seconds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quality-explorer-large-map-"));
    const mapPath = path.join(root, "quality-map.yaml");

    try {
      await writeFile(mapPath, buildLargeQualityMap(100, 500), "utf8");

      const startedAt = performance.now();
      const batch = parseQualityMaps([
        {
          projectRelativePath: "large/quality-map.yaml",
          resolvedLocalPath: mapPath,
          sourcePattern: "test"
        }
      ]);
      const elapsedMs = performance.now() - startedAt;

      expect(batch.results[0]?.status).toBe("valid");
      expect(batch.results[0]?.graph?.expectations).toHaveLength(100);
      expect(batch.results[0]?.graph?.evidence).toHaveLength(500);
      expect(elapsedMs).toBeLessThan(2_000);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("returns actionable diagnostics for malformed maps and wrong field shapes", () => {
    const batch = parseQualityMaps([
      fixtureQualityMapSource("invalid/invalid-yaml.yaml"),
      fixtureQualityMapSource("invalid/wrong-shape.yaml"),
      fixtureQualityMapSource("invalid/duplicate-ids.yaml")
    ]);

    expect(batch.results.map((result) => result.status)).toEqual(["invalid", "invalid", "partial"]);
    expect(batch.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INVALID_YAML", mapPath: "invalid/invalid-yaml.yaml" }),
        expect.objectContaining({ code: "INVALID_FIELD_SHAPE", yamlPath: "$.expectations" }),
        expect.objectContaining({
          code: "DUPLICATE_ENTITY_ID",
          affectedEntityId: "duplicate-expectation"
        })
      ])
    );
    expect(batch.diagnostics.every((diagnostic) => diagnostic.mapPath.length > 0)).toBe(true);
    expect(batch.diagnostics.every((diagnostic) => diagnostic.yamlPath.startsWith("$"))).toBe(true);
  });

  it("wires discovered quality maps into scan results without changing scan status", async () => {
    const fixtureProject = path.resolve("tests/fixtures/quality-projects/complete");
    const result = await scanProject({ projectPath: fixtureProject, mode: "scan" });

    expect(result.status).toBe("completed");
    expect(result.qualityMaps.results).toHaveLength(2);
    expect(result.qualityMaps.results.every((mapResult) => mapResult.status === "invalid")).toBe(
      true
    );
    expect(result.qualityMaps.diagnostics.every((diagnostic) => diagnostic.mapPath.endsWith("quality-map.yaml"))).toBe(
      true
    );
  });
});
