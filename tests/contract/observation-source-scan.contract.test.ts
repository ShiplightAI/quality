import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanProject } from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

const fixtureRoot = path.resolve("tests/fixtures/quality-projects");

describe("observation source scan contract", () => {
  it("discovers the shared profile file and keeps it out of target candidates", async () => {
    const result = await scanProject({
      projectPath: path.join(fixtureRoot, "complete"),
      mode: "scan"
    });

    expect(result.status).toBe("completed");
    expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toContain(
      ".quality/config/observation-sources.yaml"
    );
    expect(result.observationSourceProfiles.primary?.status).toBe("parsed");
    expect(result.observationSourceProfiles.primary?.document?.profiles.map((profile) => profile.id)).toEqual([
      "monots-cli-release",
      "monots-mcp-release"
    ]);
    expect(result.targetCandidates.every((candidate) => candidate.label !== ".quality")).toBe(true);
  });

  it("treats a repo with only a shared source profile file as non-empty scan input", async () => {
    const fixture = await createFixtureProject("source-profile-only-contract", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "release-cli"
    name: "Release CLI"
    transport: "github-actions"
    observation_path: "quality-observations.json"
    github:
      repo: "ShiplightAI/monots"
      workflow: "publish-cli.yml"
      artifact_names:
        - "qc-observations-cli"
    auth:
      required_env:
        - "GITHUB_TOKEN"
`
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });

      expect(result.status).toBe("completed");
      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual([
        ".quality/config/observation-sources.yaml"
      ]);
      expect(result.targetCandidates).toEqual([]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "NO_ARTIFACTS_FOUND")).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
