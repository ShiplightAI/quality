import { describe, expect, it } from "vitest";
import { executeObservationSourceProfile, findObservationSourceProfile, scanProject } from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

describe("canonical observation file convention", () => {
  it("reads only the declared quality-observations file from a local folder", async () => {
    const fixture = await createFixtureProject("observation-manifest-convention", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-smoke"
    name: "Local smoke checks"
    transport: "local-folder"
    observation_path: "quality-observations.json"
    local_folder:
      path: "observations"
`
      },
      {
        relativePath: "observations/quality-observations.json",
        contents: JSON.stringify({
          schema_version: 1,
          revision: { commit: "abc123" },
          observed_at: "2026-07-26T18:00:00Z",
          observations: [
            {
              path: ".github/workflows/release-ci-runner.yml",
              test_case: "agent_payload",
              status: "pass"
            },
            {
              path: ".github/workflows/release-vm-image.yml",
              test_case: "testbox_http_ready",
              status: "fail"
            }
          ]
        })
      },
      {
        relativePath: "observations/unrelated.json",
        contents: JSON.stringify({ this: "is not scanned" })
      }
    ]);

    const scan = await scanProject({ projectPath: fixture.root, mode: "scan" });
    const profile = findObservationSourceProfile(scan.observationSourceProfiles, "local-smoke");
    expect(profile).toBeDefined();

    const executed = await executeObservationSourceProfile({
      profile: profile!,
      projectRoot: fixture.root
    });

    expect(executed.status).toBe("valid");
    expect(executed.observations).toHaveLength(2);
    const byCase = Object.fromEntries(executed.observations.map((o) => [o.testCase, o.status]));
    expect(byCase).toEqual({ agent_payload: "pass", testbox_http_ready: "fail" });
    expect(executed.artifacts).toHaveLength(1);
  });
});
