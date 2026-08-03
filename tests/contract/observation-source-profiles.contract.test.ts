import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateObservationSourceProfilesEnv, parseObservationSourceProfiles } from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

describe("observation source profile contract", () => {
  it("parses transport-only profiles that locate canonical observation files", async () => {
    const fixture = await createFixtureProject("observation-source-profiles", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "monots-cli-release"
    name: "Monots CLI Release Gate"
    description: "Read canonical observations from the published workflow artifact."
    transport: "github-actions"
    observation_path: "quality-observations.json"
    github:
      repo: "ShiplightAI/monots"
      workflow: "publish-cli.yml"
      artifact_names:
        - "quality-observations-cli"
    auth:
      required_env:
        - "GITHUB_TOKEN"
  - id: "local-review"
    name: "Local review"
    transport: "local-folder"
    observation_path: "quality-observations.json"
    local_folder:
      path: "artifacts/quality"
    auth:
      required_env:
        - "SHIPLIGHT_SESSION_TOKEN"
`
      }
    ]);

    try {
      const batch = parseObservationSourceProfiles([
        {
          projectRelativePath: ".quality/config/observation-sources.yaml",
          resolvedLocalPath: path.join(fixture.root, ".quality/config/observation-sources.yaml"),
          sourcePattern: ".quality/config/observation-sources.yaml"
        }
      ]);

      expect(batch.results).toHaveLength(1);
      expect(batch.primary?.status).toBe("parsed");
      expect(batch.primary?.document?.profiles).toEqual([
        expect.objectContaining({
          id: "monots-cli-release",
          transport: "github-actions",
          observationPath: "quality-observations.json"
        }),
        expect.objectContaining({
          id: "local-review",
          transport: "local-folder",
          observationPath: "quality-observations.json"
        })
      ]);

      const envStatus = evaluateObservationSourceProfilesEnv(batch.primary?.document?.profiles ?? [], {
        GITHUB_TOKEN: "set"
      } as NodeJS.ProcessEnv);

      expect(envStatus).toEqual([
        {
          profileId: "monots-cli-release",
          allPresent: true,
          requiredEnv: [{ name: "GITHUB_TOKEN", present: true }]
        },
        {
          profileId: "local-review",
          allPresent: false,
          requiredEnv: [{ name: "SHIPLIGHT_SESSION_TOKEN", present: false }]
        }
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects the legacy source_kind and adapters configuration", async () => {
    const fixture = await createFixtureProject("legacy-observation-source-profiles", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "legacy"
    name: "Legacy"
    transport: "local-folder"
    observation_path: "quality-observations.json"
    source_kind: "local-folder"
    local_folder:
      path: "tmp/results"
    adapters:
      - id: "junit"
        type: "junit"
        artifact_path: "junit.xml"
`
      }
    ]);

    try {
      const batch = parseObservationSourceProfiles([
        {
          projectRelativePath: ".quality/config/observation-sources.yaml",
          resolvedLocalPath: path.join(fixture.root, ".quality/config/observation-sources.yaml")
        }
      ]);

      expect(batch.primary?.status).toBe("invalid");
      expect(batch.diagnostics).toEqual([
        expect.objectContaining({
          code: "INVALID_OBSERVATION_SOURCE_PROFILE",
          message: expect.stringContaining("source_kind, adapters")
        })
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects duplicate profile ids and missing observation paths", async () => {
    const fixture = await createFixtureProject("invalid-observation-source-profiles", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "shared"
    name: "Shared"
    transport: "local-folder"
    observation_path: "quality-observations.json"
    local_folder:
      path: "tmp/results"
  - id: "shared"
    name: "Duplicate"
    transport: "github-actions"
    observation_path: "quality-observations.json"
    github:
      repo: "ShiplightAI/monots"
      workflow: "publish-cli.yml"
      artifact_names:
        - "quality-observations-cli"
  - id: "missing-path"
    name: "Missing path"
    transport: "local-folder"
    local_folder:
      path: "tmp/missing"
`
      }
    ]);

    try {
      const batch = parseObservationSourceProfiles([
        {
          projectRelativePath: ".quality/config/observation-sources.yaml",
          resolvedLocalPath: path.join(fixture.root, ".quality/config/observation-sources.yaml")
        }
      ]);

      expect(batch.primary?.status).toBe("invalid");
      expect(batch.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        "INVALID_OBSERVATION_SOURCE_PROFILE",
        "DUPLICATE_OBSERVATION_SOURCE_PROFILE_ID"
      ]);
      expect(batch.primary?.document?.profiles.map((profile) => profile.id)).toEqual(["shared", "shared"]);
    } finally {
      await fixture.cleanup();
    }
  });
});
