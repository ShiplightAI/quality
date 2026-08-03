import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import {
  buildTargetEvaluation,
  executeObservationSourceProfile,
  findObservationSourceProfile,
  scanProject,
  resolveObservations
} from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { publishCliRunFixture } from "../fixtures/observations/github-actions";

function zipBuffer(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [entryPath, contents] of Object.entries(files)) {
    zip.addFile(entryPath, Buffer.from(contents, "utf8"));
  }
  return zip.toBuffer();
}

describe("observation source execution integration", () => {
  it("executes a scanned shared source profile and turns it into a target evaluation snapshot", async () => {
    const fixture = await createFixtureProject("observation-source-execution", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "monots-cli-release"
    name: "Monots CLI Release Gate"
    transport: "github-actions"
    observation_path: "quality-observations.json"
    github:
      repo: "ShiplightAI/monots"
      workflow: "publish-cli.yml"
      artifact_names:
        - "release-diagnostics-*"
    auth:
      required_env:
        - "GITHUB_TOKEN"
`
      },
      {
        relativePath: ".quality/evidence/002-shiplightai-cli/quality-map.yaml",
        contents: `target:
  id: "002-shiplightai-cli"
  name: "shiplightai CLI"
  scope: "feature"
expectations:
  - id: "release-cli-proof"
    title: "CLI release-gate observations map onto structural proof"
    source_type: "IMPLEMENTATION"
    category: "release"
    priority: "P1"
    risk:
      weight: 4
      rationale: "Release proof should stay traceable when runtime observations are joined."
    evidence:
      - id: "browser-create-e2e"
        type: "e2e"
        path: "apps/cli/src/commands/create.e2e.test.ts"
        contexts: ["release-gate"]
      - id: "browser-test-run-e2e"
        type: "e2e"
        path: "apps/cli/src/commands/test-run.e2e.test.ts"
        contexts: ["release-gate"]
      - id: "browser-test-vars-e2e"
        type: "e2e"
        path: "apps/cli/src/commands/test.vars.e2e.test.ts"
        contexts: ["release-gate"]
      - id: "example-homepage-release-smoke"
        type: "e2e"
        path: "tests/examples/example-homepage.yaml.spec.ts"
        contexts: ["release-gate"]
`
      }
    ]);

    const workflowRun = {
      id: publishCliRunFixture.databaseId,
      name: "publish-cli.yml",
      display_title: publishCliRunFixture.displayTitle,
      head_sha: publishCliRunFixture.headSha,
      head_branch: "main",
      status: publishCliRunFixture.status,
      conclusion: publishCliRunFixture.conclusion,
      created_at: publishCliRunFixture.createdAt,
      updated_at: publishCliRunFixture.updatedAt,
      html_url: publishCliRunFixture.url
    };
    const artifactZip = zipBuffer({
      "quality-observations.json": JSON.stringify({
        schema_version: 1,
        revision: {
          commit: publishCliRunFixture.headSha,
          branch: "main"
        },
        run: {
          id: String(publishCliRunFixture.databaseId),
          url: publishCliRunFixture.url
        },
        observed_at: publishCliRunFixture.updatedAt,
        observations: [
          {
            path: "apps/cli/src/commands/create.e2e.test.ts",
            test_case: "create command scaffolds a runnable project",
            status: "pass"
          },
          {
            path: "apps/cli/src/commands/test-run.e2e.test.ts",
            test_case: "test command propagates failure exit code",
            status: "pass"
          },
          {
            path: "apps/cli/src/commands/test.vars.e2e.test.ts",
            test_case: "test command passes variable overrides into fixture context",
            status: "pass"
          },
          {
            path: "tests/examples/example-homepage.yaml.spec.ts",
            test_case: "Release-gate smoke renders the example homepage",
            status: "pass"
          }
        ]
      })
    });

    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/actions/workflows/publish-cli.yml/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [workflowRun] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith(`/actions/runs/${publishCliRunFixture.databaseId}/artifacts?per_page=100`)) {
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                id: 1,
                name: "release-diagnostics-0.31.0",
                archive_download_url: "https://download.example/release-diagnostics-0.31.0.zip",
                expired: false,
                updated_at: publishCliRunFixture.updatedAt
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://download.example/release-diagnostics-0.31.0.zip") {
        return new Response(artifactZip, { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    try {
      const scan = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const profile = findObservationSourceProfile(scan.observationSourceProfiles, "monots-cli-release");

      expect(profile).toBeDefined();

      const executed = await executeObservationSourceProfile({
        profile: profile!,
        env: { GITHUB_TOKEN: "test-token" },
        fetchImpl
      });
      const resolved = resolveObservations(scan, executed);
      const targetId = scan.qualityMaps.results[0]?.graph?.target.normalizedId;
      if (targetId === undefined) {
        throw new Error("Expected quality-map target id.");
      }

      const evaluation = buildTargetEvaluation({
        result: scan,
        targetId,
        observations: resolved,
        selection: {
          commit: publishCliRunFixture.headSha
        }
      });

      expect(executed.status).toBe("valid");
      expect(resolved.status).toBe("valid");
      expect(evaluation.state).toBe("available");
      expect(evaluation.observedState).toBe("pass");
      expect(evaluation.counts.pass).toBe(1);
      expect(evaluation.expectations[0]?.evidence.map((entry) => entry.state)).toEqual([
        "pass",
        "pass",
        "pass",
        "pass"
      ]);
    } finally {
      await fixture.cleanup();
    }
  });
});
