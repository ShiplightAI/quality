import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findObservationSet,
  parseObservationSets
} from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

describe("observation set contract", () => {
  it("parses saved observation sets that bundle multiple atomic observation source profiles", async () => {
    const fixture = await createFixtureProject("observation-sets-contract", [
      {
        relativePath: ".quality/config/observation-sets.yaml",
        contents: `observation_sets:
  - id: "release-gate"
    name: "Release Gate"
    description: "Combine publish workflows for release review."
    profiles:
      - profile_id: "monots-cli-release"
      - profile_id: "monots-mcp-release"
`
      }
    ]);

    try {
      const batch = parseObservationSets([
        {
          projectRelativePath: ".quality/config/observation-sets.yaml",
          resolvedLocalPath: path.join(fixture.root, ".quality/config/observation-sets.yaml"),
          sourcePattern: ".quality/config/observation-sets.yaml"
        }
      ]);

      expect(batch.results).toHaveLength(1);
      expect(batch.primary?.status).toBe("parsed");
      expect(batch.primary?.document?.observationSets).toEqual([
        {
          id: "release-gate",
          name: "Release Gate",
          description: "Combine publish workflows for release review.",
          profiles: [
            { profileId: "monots-cli-release" },
            { profileId: "monots-mcp-release" }
          ]
        }
      ]);
      expect(findObservationSet(batch, "release-gate")?.profiles.map((profile) => profile.profileId)).toEqual([
        "monots-cli-release",
        "monots-mcp-release"
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects duplicate set ids and duplicate profile references inside one set", async () => {
    const fixture = await createFixtureProject("invalid-observation-sets-contract", [
      {
        relativePath: ".quality/config/observation-sets.yaml",
        contents: `observation_sets:
  - id: "release-gate"
    name: "Release Gate"
    profiles:
      - profile_id: "monots-cli-release"
      - profile_id: "monots-cli-release"
  - id: "release-gate"
    name: "Duplicate"
    profiles:
      - profile_id: "monots-mcp-release"
`
      }
    ]);

    try {
      const batch = parseObservationSets([
        {
          projectRelativePath: ".quality/config/observation-sets.yaml",
          resolvedLocalPath: path.join(fixture.root, ".quality/config/observation-sets.yaml"),
          sourcePattern: ".quality/config/observation-sets.yaml"
        }
      ]);

      expect(batch.primary?.status).toBe("invalid");
      expect(batch.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        "DUPLICATE_OBSERVATION_SET_PROFILE_ID",
        "DUPLICATE_OBSERVATION_SET_ID"
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects the reserved static export id", async () => {
    const fixture = await createFixtureProject("reserved-static-observation-set", [
      {
        relativePath: ".quality/config/observation-sets.yaml",
        contents: `observation_sets:
  - id: "STATIC"
    name: "Static"
    profiles:
      - profile_id: "local"
`
      }
    ]);

    try {
      const batch = parseObservationSets([
        {
          projectRelativePath: ".quality/config/observation-sets.yaml",
          resolvedLocalPath: path.join(fixture.root, ".quality/config/observation-sets.yaml"),
          sourcePattern: ".quality/config/observation-sets.yaml"
        }
      ]);

      expect(batch.primary?.status).toBe("invalid");
      expect(batch.primary?.document?.observationSets).toEqual([]);
      expect(batch.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "RESERVED_OBSERVATION_SET_ID" })
        ])
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
