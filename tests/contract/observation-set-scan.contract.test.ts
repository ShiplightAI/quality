import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanProject } from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

const fixtureRoot = path.resolve("tests/fixtures/quality-projects");

describe("observation set scan contract", () => {
  it("discovers the shared observation-set file and keeps it out of target candidates", async () => {
    const result = await scanProject({
      projectPath: path.join(fixtureRoot, "complete"),
      mode: "scan"
    });

    expect(result.status).toBe("completed");
    expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toContain(
      ".quality/config/observation-sets.yaml"
    );
    expect(result.observationSets.primary?.status).toBe("parsed");
    expect(result.observationSets.primary?.document?.observationSets.map((observationSet) => observationSet.id)).toEqual([
      "release-gate"
    ]);
    expect(result.targetCandidates.every((candidate) => candidate.label !== ".quality")).toBe(true);
  });

  it("reports a warning when a saved observation set references an unknown source profile", async () => {
    const fixture = await createFixtureProject("observation-set-missing-profile", [
      {
        relativePath: ".quality/config/observation-sets.yaml",
        contents: `observation_sets:
  - id: "release-gate"
    name: "Release Gate"
    profiles:
      - profile_id: "missing-profile"
`
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });

      expect(result.status).toBe("partial");
      expect(result.observationSets.primary?.status).toBe("parsed");
      expect(result.diagnostics).toContainEqual({
        severity: "warning",
        code: "UNKNOWN_OBSERVATION_SET_PROFILE",
        message: "Observation set release-gate references unknown observation source profile missing-profile.",
        affectedPath: ".quality/config/observation-sets.yaml"
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
