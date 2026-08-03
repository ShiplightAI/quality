import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { executeObservationSet, type ObservationSet, type ObservationSourceProfile } from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

function zipBuffer(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [entryPath, contents] of Object.entries(files)) {
    zip.addFile(entryPath, Buffer.from(contents, "utf8"));
  }
  return zip.toBuffer();
}

const cliPaths = [
  "/home/runner/work/monots/monots/apps/cli/src/commands/create.e2e.test.ts",
  "/home/runner/work/monots/monots/apps/cli/src/commands/test-run.e2e.test.ts",
  "/home/runner/work/monots/monots/apps/cli/src/commands/test.vars.e2e.test.ts"
] as const;
const mcpPaths = [
  "/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts",
  "/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts",
  "/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts"
] as const;

function manifest(input: {
  readonly commit: string;
  readonly runId?: string;
  readonly observedAt: string;
  readonly paths: readonly string[];
}): string {
  return JSON.stringify({
    schema_version: 1,
    revision: { commit: input.commit },
    ...(input.runId === undefined ? {} : { run: { id: input.runId } }),
    observed_at: input.observedAt,
    observations: input.paths.map((path, index) => ({
      path,
      test_case: `case ${index + 1}`,
      status: "pass"
    }))
  });
}

describe("observation set execution contract", () => {
  it("merges observations from multiple saved source profiles into one runtime batch", async () => {
    const fixture = await createFixtureProject("observation-set-execution-contract", [
      {
        relativePath: "artifacts/cli/quality-observations.json",
        contents: manifest({
          commit: "abc123",
          observedAt: "2026-06-08T12:05:00Z",
          paths: cliPaths
        })
      },
      {
        relativePath: "artifacts/mcp/quality-observations.json",
        contents: manifest({
          commit: "abc123",
          observedAt: "2026-06-08T12:05:00Z",
          paths: mcpPaths
        })
      }
    ]);

    const profiles: readonly ObservationSourceProfile[] = [
      {
        id: "local-cli-release",
        name: "Local CLI Release",
        transport: "local-folder",
        observationPath: "quality-observations.json",
        requiredEnv: [],
        sourceRefs: [],
        localFolder: { path: "artifacts/cli" }
      },
      {
        id: "local-mcp-release",
        name: "Local MCP Release",
        transport: "local-folder",
        observationPath: "quality-observations.json",
        requiredEnv: [],
        sourceRefs: [],
        localFolder: { path: "artifacts/mcp" }
      }
    ];

    const observationSet: ObservationSet = {
      id: "release-gate",
      name: "Release Gate",
      profiles: [{ profileId: "local-cli-release" }, { profileId: "local-mcp-release" }]
    };

    try {
      const result = await executeObservationSet({
        observationSet,
        observationSourceProfiles: profiles,
        projectRoot: fixture.root
      });

      expect(result.status).toBe("valid");
      expect(result.profiles.map((profile) => profile.profileId)).toEqual(["local-cli-release", "local-mcp-release"]);
      expect(result.observations.map((observation) => observation.testFile)).toEqual([
        "/home/runner/work/monots/monots/apps/cli/src/commands/create.e2e.test.ts",
        "/home/runner/work/monots/monots/apps/cli/src/commands/test-run.e2e.test.ts",
        "/home/runner/work/monots/monots/apps/cli/src/commands/test.vars.e2e.test.ts",
        "/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts",
        "/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts",
        "/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts"
      ]);
      expect(result.diagnostics).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("warns when a saved observation set references a profile that is not present", async () => {
    const observationSet: ObservationSet = {
      id: "release-gate",
      name: "Release Gate",
      profiles: [{ profileId: "missing-profile" }]
    };

    const result = await executeObservationSet({
      observationSet,
      observationSourceProfiles: []
    });

    expect(result.status).toBe("invalid");
    expect(result.profiles).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      severity: "warning",
      code: "UNKNOWN_OBSERVATION_SET_PROFILE",
      message: "Observation set release-gate references unknown observation source profile missing-profile."
    });
  });

  it("allows merged observation sets to use profile runs from different commits without warning", async () => {
    const profiles: readonly ObservationSourceProfile[] = [
      {
        id: "monots-cli-publish",
        name: "Monots CLI Publish",
        transport: "github-actions",
        observationPath: "quality-observations.json",
        requiredEnv: ["GITHUB_TOKEN"],
        sourceRefs: [],
        github: {
          repo: "ShiplightAI/monots",
          workflow: "publish-cli.yml",
          artifactNames: ["release-diagnostics-*"]
        }
      },
      {
        id: "monots-mcp-publish",
        name: "Monots MCP Publish",
        transport: "github-actions",
        observationPath: "quality-observations.json",
        requiredEnv: ["GITHUB_TOKEN"],
        sourceRefs: [],
        github: {
          repo: "ShiplightAI/monots",
          workflow: "publish-mcp.yml",
          artifactNames: ["release-diagnostics-mcp*"]
        }
      }
    ];

    const observationSet: ObservationSet = {
      id: "monots-publish-review",
      name: "Monots Publish Review",
      profiles: [{ profileId: "monots-cli-publish" }, { profileId: "monots-mcp-publish" }]
    };

    const cliRun = {
      id: 101,
      name: "publish-cli.yml",
      display_title: "CLI latest",
      head_sha: "commit-cli",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      created_at: "2026-06-08T12:00:00Z",
      updated_at: "2026-06-08T12:05:00Z",
      html_url: "https://github.com/ShiplightAI/monots/actions/runs/101"
    };
    const mcpRun = {
      id: 201,
      name: "publish-mcp.yml",
      display_title: "MCP latest",
      head_sha: "commit-mcp",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      created_at: "2026-06-08T12:10:00Z",
      updated_at: "2026-06-08T12:15:00Z",
      html_url: "https://github.com/ShiplightAI/monots/actions/runs/201"
    };

    const cliZip = zipBuffer({
      "quality-observations.json": manifest({
        commit: "commit-cli",
        runId: "101",
        observedAt: "2026-06-08T12:05:00Z",
        paths: cliPaths
      })
    });
    const mcpZip = zipBuffer({
      "quality-observations.json": manifest({
        commit: "commit-mcp",
        runId: "201",
        observedAt: "2026-06-08T12:15:00Z",
        paths: mcpPaths
      })
    });

    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/actions/workflows/publish-cli.yml/runs?")) {
        return new Response(JSON.stringify({ workflow_runs: [cliRun] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.includes("/actions/workflows/publish-mcp.yml/runs?")) {
        return new Response(JSON.stringify({ workflow_runs: [mcpRun] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/actions/runs/101/artifacts?per_page=100")) {
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                id: 1,
                name: "release-diagnostics-cli",
                archive_download_url: "https://download.example/cli.zip",
                expired: false,
                updated_at: "2026-06-08T12:05:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/actions/runs/201/artifacts?per_page=100")) {
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                id: 2,
                name: "release-diagnostics-mcp",
                archive_download_url: "https://download.example/mcp.zip",
                expired: false,
                updated_at: "2026-06-08T12:15:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://download.example/cli.zip") {
        return new Response(cliZip, { status: 200 });
      }

      if (url === "https://download.example/mcp.zip") {
        return new Response(mcpZip, { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    const result = await executeObservationSet({
      observationSet,
      observationSourceProfiles: profiles,
      env: { GITHUB_TOKEN: "test-token" },
      fetchImpl
    });

    expect(result.status).toBe("valid");
    expect(result.resolvedCommit).toBeUndefined();
    expect(result.observations).toHaveLength(6);
    expect(result.diagnostics).toEqual([]);
  });
});
