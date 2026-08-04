import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import {
  executeObservationSourceProfile,
  diagnosticGuidanceFor,
  type ObservationSourceProfile
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

const cliObservations = [
  {
    path: "/home/runner/work/monots/monots/apps/cli/src/commands/create.e2e.test.ts",
    test_case: "create command scaffolds a runnable project",
    status: "pass"
  },
  {
    path: "/home/runner/work/monots/monots/apps/cli/src/commands/test-run.e2e.test.ts",
    test_case: "test command propagates failure exit code",
    status: "pass"
  },
  {
    path: "/home/runner/work/monots/monots/apps/cli/src/commands/test.vars.e2e.test.ts",
    test_case: "test command passes variable overrides into fixture context",
    status: "pass"
  },
  {
    path: "tests/examples/example-homepage.yaml.spec.ts",
    test_case: "Release-gate smoke renders the example homepage",
    status: "pass"
  },
  {
    path: "tests/examples/example-homepage.yaml.spec.ts",
    test_case: "Release-gate smoke exports the Shiplight report bundle",
    status: "pass"
  }
] as const;

function manifest(
  input: {
    readonly commit?: string;
    readonly runId?: string;
    readonly runUrl?: string;
    readonly observedAt?: string;
    readonly observations?: readonly Record<string, unknown>[];
  } = {}
): string {
  return JSON.stringify({
    schema_version: 1,
    revision: {
      commit: input.commit ?? "abc123"
    },
    ...(input.runId === undefined
      ? {}
      : {
          run: {
            id: input.runId,
            ...(input.runUrl === undefined ? {} : { url: input.runUrl })
          }
        }),
    observed_at: input.observedAt ?? "2026-06-08T12:05:00Z",
    observations: input.observations ?? cliObservations
  });
}

describe("observation source execution contract", () => {
  it("executes a local-folder profile against one canonical observation file", async () => {
    const fixture = await createFixtureProject("observation-source-local-folder", [
      {
        relativePath: "artifacts/quality-observations.json",
        contents: manifest()
      }
    ]);

    const profile: ObservationSourceProfile = {
      id: "local-release",
      name: "Local Release Artifacts",
      transport: "local-folder",
      observationPath: "quality-observations.json",
      requiredEnv: [],
      sourceRefs: [],
      localFolder: {
        path: "artifacts"
      }
    };

    try {
      const result = await executeObservationSourceProfile({
        profile,
        projectRoot: fixture.root
      });

      expect(result.status).toBe("valid");
      expect(result.envStatus.allPresent).toBe(true);
      expect(result.artifacts).toEqual([
        expect.objectContaining({
          declaredObservationPath: "quality-observations.json",
          sourcePath: expect.stringContaining("artifacts/quality-observations.json")
        })
      ]);
      expect(result.observations.map((observation) => [observation.testFile, observation.testCase])).toEqual([
        [
          "/home/runner/work/monots/monots/apps/cli/src/commands/create.e2e.test.ts",
          "create command scaffolds a runnable project"
        ],
        [
          "/home/runner/work/monots/monots/apps/cli/src/commands/test-run.e2e.test.ts",
          "test command propagates failure exit code"
        ],
        [
          "/home/runner/work/monots/monots/apps/cli/src/commands/test.vars.e2e.test.ts",
          "test command passes variable overrides into fixture context"
        ],
        ["tests/examples/example-homepage.yaml.spec.ts", "Release-gate smoke renders the example homepage"],
        ["tests/examples/example-homepage.yaml.spec.ts", "Release-gate smoke exports the Shiplight report bundle"]
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns a deterministic missing-env diagnostic before executing a remote profile", async () => {
    const profile: ObservationSourceProfile = {
      id: "monots-cli-release",
      name: "Monots CLI Release Gate",
      transport: "github-actions",
      observationPath: "quality-observations.json",
      requiredEnv: ["GITHUB_TOKEN"],
      sourceRefs: [],
      github: {
        repo: "ShiplightAI/monots",
        workflow: "publish-cli.yml",
        artifactNames: ["release-diagnostics-*"]
      }
    };

    const result = await executeObservationSourceProfile({
      profile,
      env: {}
    });

    expect(result.status).toBe("invalid");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MISSING_OBSERVATION_SOURCE_ENV"
      })
    );
  });

  it("executes a GitHub Actions profile by selecting a run and reading its canonical observation file", async () => {
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
      "quality-observations.json": manifest({
        commit: "producer-authored-revision",
        runId: String(publishCliRunFixture.databaseId),
        runUrl: publishCliRunFixture.url,
        observedAt: publishCliRunFixture.updatedAt
      })
    });

    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/actions/workflows/publish-cli.yml/runs")) {
        return new Response(
          JSON.stringify({
            workflow_runs: [workflowRun]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
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

    const profile: ObservationSourceProfile = {
      id: "monots-cli-release",
      name: "Monots CLI Release Gate",
      transport: "github-actions",
      observationPath: "quality-observations.json",
      requiredEnv: ["GITHUB_TOKEN"],
      sourceRefs: [],
      github: {
        repo: "ShiplightAI/monots",
        workflow: "publish-cli.yml",
        artifactNames: ["release-diagnostics-*"]
      }
    };

    const result = await executeObservationSourceProfile({
      profile,
      env: { GITHUB_TOKEN: "test-token" },
      fetchImpl
    });

    expect(result.status).toBe("valid");
    expect(result.selectedRun).toEqual(
      expect.objectContaining({
        runId: publishCliRunFixture.databaseId,
        commit: publishCliRunFixture.headSha
      })
    );
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        declaredObservationPath: "quality-observations.json",
        matchedArtifactName: "release-diagnostics-0.31.0",
        matchedObservationPath: "quality-observations.json"
      })
    ]);
    expect(result.observations.map((observation) => [observation.testFile, observation.testCase])).toEqual([
      [
        "/home/runner/work/monots/monots/apps/cli/src/commands/create.e2e.test.ts",
        "create command scaffolds a runnable project"
      ],
      [
        "/home/runner/work/monots/monots/apps/cli/src/commands/test-run.e2e.test.ts",
        "test command propagates failure exit code"
      ],
      [
        "/home/runner/work/monots/monots/apps/cli/src/commands/test.vars.e2e.test.ts",
        "test command passes variable overrides into fixture context"
      ],
      ["tests/examples/example-homepage.yaml.spec.ts", "Release-gate smoke renders the example homepage"],
      ["tests/examples/example-homepage.yaml.spec.ts", "Release-gate smoke exports the Shiplight report bundle"]
    ]);
    expect(result.observations.every((observation) => observation.revision.commit === publishCliRunFixture.headSha)).toBe(
      true
    );
  });

  it("merges canonical observation files published by several selected artifacts", async () => {
    const workflowRun = {
      id: 789,
      name: "release.yml",
      head_sha: "abc123",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      created_at: "2026-06-08T12:00:00Z",
      updated_at: "2026-06-08T12:05:00Z",
      html_url: "https://github.com/ShiplightAI/example/actions/runs/789"
    };
    const healthZip = zipBuffer({
      "quality-observations.json": manifest({
        runId: "789",
        observations: [
          {
            path: ".github/workflows/release.yml",
            test_case: "health",
            status: "pass"
          }
        ]
      })
    });
    const gatesZip = zipBuffer({
      "reports/quality-observations.json": manifest({
        runId: "789",
        observations: [
          {
            path: ".github/workflows/release.yml",
            test_case: "release_gate",
            status: "pass"
          }
        ]
      })
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/actions/workflows/release.yml/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [workflowRun] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/actions/runs/789/artifacts?per_page=100")) {
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                id: 1,
                name: "release-health",
                archive_download_url: "https://download.example/health.zip",
                expired: false
              },
              {
                id: 2,
                name: "release-gates",
                archive_download_url: "https://download.example/gates.zip",
                expired: false
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://download.example/health.zip") {
        return new Response(healthZip, { status: 200 });
      }
      if (url === "https://download.example/gates.zip") {
        return new Response(gatesZip, { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };
    const profile: ObservationSourceProfile = {
      id: "release",
      name: "Release",
      transport: "github-actions",
      observationPath: "quality-observations.json",
      requiredEnv: ["GITHUB_TOKEN"],
      sourceRefs: [],
      github: {
        repo: "ShiplightAI/example",
        workflow: "release.yml",
        artifactNames: ["release-health", "release-gates"]
      }
    };

    const result = await executeObservationSourceProfile({
      profile,
      env: { GITHUB_TOKEN: "test-token" },
      fetchImpl
    });

    expect(result.status).toBe("valid");
    expect(result.artifacts).toHaveLength(2);
    expect(result.observations.map((entry) => entry.testCase)).toEqual(["health", "release_gate"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("warns when a configured artifact selector matched nothing in the selected run", async () => {
    // A run that published only some of its configured artifacts still yields
    // matches, so a guard on "matched nothing at all" stays silent. Every check
    // backed by the missing artifact then reads unobserved with no explanation —
    // for a repo whose test suite is one artifact and a release gate the other,
    // that is the entire suite disappearing without a diagnostic.
    const workflowRun = {
      id: 791,
      name: "ci.yml",
      head_sha: "abc123",
      head_branch: "main",
      status: "completed",
      conclusion: "failure",
      created_at: "2026-06-08T12:00:00Z",
      updated_at: "2026-06-08T12:05:00Z",
      html_url: "https://github.com/ShiplightAI/example/actions/runs/791"
    };
    const gatesZip = zipBuffer({
      "quality-observations.json": manifest({
        runId: "791",
        observations: [{ path: ".github/workflows/ci.yml", test_case: "release_gate", status: "pass" }]
      })
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/actions/workflows/ci.yml/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [workflowRun] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/actions/runs/791/artifacts?per_page=100")) {
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                id: 1,
                name: "quality-observations-size-gate",
                archive_download_url: "https://download.example/gates.zip",
                expired: false
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://download.example/gates.zip") {
        return new Response(gatesZip, { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };
    const profile: ObservationSourceProfile = {
      id: "ci",
      name: "CI",
      transport: "github-actions",
      observationPath: "quality-observations.json",
      requiredEnv: ["GITHUB_TOKEN"],
      sourceRefs: [],
      github: {
        repo: "ShiplightAI/example",
        workflow: "ci.yml",
        artifactNames: ["quality-observations-tests", "quality-observations-size-gate"]
      }
    };

    const result = await executeObservationSourceProfile({
      profile,
      env: { GITHUB_TOKEN: "test-token" },
      fetchImpl
    });

    // The observations that DID arrive stay usable; the gap is reported, not guessed at.
    expect(result.observations.map((entry) => entry.testCase)).toEqual(["release_gate"]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "INCOMPLETE_OBSERVATION_ARTIFACT_MATCH" })
    );
  });

  it("warns when several selected artifacts publish the same observation identity", async () => {
    const workflowRun = {
      id: 790,
      name: "release.yml",
      head_sha: "abc123",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      created_at: "2026-06-08T12:00:00Z",
      updated_at: "2026-06-08T12:05:00Z",
      html_url: "https://github.com/ShiplightAI/example/actions/runs/790"
    };
    const duplicateObservation = [
      {
        path: ".github/workflows/release.yml",
        test_case: "release_gate",
        status: "pass"
      }
    ];
    const healthZip = zipBuffer({
      "quality-observations.json": manifest({
        runId: "790",
        observations: duplicateObservation
      })
    });
    const gatesZip = zipBuffer({
      "quality-observations.json": manifest({
        runId: "790",
        observations: duplicateObservation
      })
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/actions/workflows/release.yml/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [workflowRun] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/actions/runs/790/artifacts?per_page=100")) {
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                id: 1,
                name: "release-health",
                archive_download_url: "https://download.example/health.zip",
                expired: false
              },
              {
                id: 2,
                name: "release-gates",
                archive_download_url: "https://download.example/gates.zip",
                expired: false
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://download.example/health.zip") {
        return new Response(healthZip, { status: 200 });
      }
      if (url === "https://download.example/gates.zip") {
        return new Response(gatesZip, { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };
    const profile: ObservationSourceProfile = {
      id: "release",
      name: "Release",
      transport: "github-actions",
      observationPath: "quality-observations.json",
      requiredEnv: ["GITHUB_TOKEN"],
      sourceRefs: [],
      github: {
        repo: "ShiplightAI/example",
        workflow: "release.yml",
        artifactNames: ["release-health", "release-gates"]
      }
    };

    const result = await executeObservationSourceProfile({
      profile,
      env: { GITHUB_TOKEN: "test-token" },
      fetchImpl
    });

    expect(result.status).toBe("partial");
    expect(result.observations).toHaveLength(2);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "AMBIGUOUS_OBSERVATION_ARTIFACT_MATCH",
        severity: "warning"
      })
    ]);
  });

  it("rejects several artifacts matched by one artifact selector as ambiguous", async () => {
    const workflowRun = {
      id: 790,
      name: "release.yml",
      head_sha: "abc123",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      created_at: "2026-06-08T12:00:00Z",
      updated_at: "2026-06-08T12:05:00Z",
      html_url: "https://github.com/ShiplightAI/example/actions/runs/790"
    };
    const firstZip = zipBuffer({
      "quality-observations.json": manifest({
        runId: "790",
        observations: [{ path: ".github/workflows/release.yml", test_case: "first", status: "pass" }]
      })
    });
    const secondZip = zipBuffer({
      "quality-observations.json": manifest({
        runId: "790",
        observations: [{ path: ".github/workflows/release.yml", test_case: "second", status: "pass" }]
      })
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/actions/workflows/release.yml/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [workflowRun] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.endsWith("/actions/runs/790/artifacts?per_page=100")) {
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                id: 1,
                name: "release-first",
                archive_download_url: "https://download.example/first.zip",
                expired: false
              },
              {
                id: 2,
                name: "release-second",
                archive_download_url: "https://download.example/second.zip",
                expired: false
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url === "https://download.example/first.zip") {
        return new Response(firstZip, { status: 200 });
      }
      if (url === "https://download.example/second.zip") {
        return new Response(secondZip, { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };
    const profile: ObservationSourceProfile = {
      id: "release",
      name: "Release",
      transport: "github-actions",
      observationPath: "quality-observations.json",
      requiredEnv: ["GITHUB_TOKEN"],
      sourceRefs: [],
      github: {
        repo: "ShiplightAI/example",
        workflow: "release.yml",
        artifactNames: ["release-*"]
      }
    };

    const result = await executeObservationSourceProfile({
      profile,
      env: { GITHUB_TOKEN: "test-token" },
      fetchImpl
    });

    expect(result.status).toBe("invalid");
    expect(result.observations).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AMBIGUOUS_OBSERVATION_ARTIFACT_MATCH"
      })
    );
  });

  it("explains missing GitHub Actions manifest artifacts with selected run and target-repo repair steps", async () => {
    const workflowRun = {
      id: 456,
      name: "release.yml",
      display_title: "Promote release",
      head_sha: "abc123",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      created_at: "2026-06-11T20:00:00Z",
      updated_at: "2026-06-11T20:05:00Z",
      html_url: "https://github.com/ShiplightAI/example/actions/runs/456"
    };
    const artifactZip = zipBuffer({
      "release-records/promoted-release.txt": "no observations in this promote-only artifact"
    });
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/actions/workflows/release.yml/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [workflowRun] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/actions/runs/456/artifacts?per_page=100")) {
        return new Response(
          JSON.stringify({
            artifacts: [
              {
                id: 1,
                name: "promoted-release-records",
                archive_download_url: "https://download.example/promote.zip",
                expired: false,
                updated_at: workflowRun.updated_at
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://download.example/promote.zip") {
        return new Response(artifactZip, { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };
    const profile: ObservationSourceProfile = {
      id: "ci-quality-evidence",
      name: "CI quality evidence",
      transport: "github-actions",
      observationPath: "quality-observations.json",
      requiredEnv: ["GITHUB_TOKEN"],
      sourceRefs: [],
      github: {
        repo: "ShiplightAI/example",
        workflow: "release.yml",
        artifactNames: ["qc-observations", "promoted-release-records"]
      }
    };

    const result = await executeObservationSourceProfile({
      profile,
      env: { GITHUB_TOKEN: "test-token" },
      fetchImpl
    });
    const diagnostic = result.diagnostics[0]!;
    const guidance = diagnosticGuidanceFor(diagnostic);

    expect(result.status).toBe("invalid");
    expect(diagnostic).toMatchObject({
      severity: "warning",
      code: "MISSING_OBSERVATION_ARTIFACT_MATCH"
    });
    expect(diagnostic.message).toContain("selected GitHub Actions run 456");
    expect(diagnostic.message).toContain("Configured artifact_names: qc-observations, promoted-release-records");
    expect(diagnostic.message).toContain("Downloaded matching artifacts: promoted-release-records");
    expect(diagnostic.message).toContain("promoted-release-records/release-records/promoted-release.txt");
    expect(guidance.recommendedAction).toContain(".quality/config/observation-sources.yaml");
    expect(guidance.agentPrompt).toContain("target repository");
    expect(guidance.agentPrompt).toContain("latest completed workflow run is a promote/deploy-only run");
  });
});
