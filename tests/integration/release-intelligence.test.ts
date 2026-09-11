import { describe, expect, it } from "vitest";
import { compileReleaseFactsOp } from "@shiplightai/quality-core/release-intelligence/operations";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

describe("release intelligence fact compilation", () => {
  it("compiles the component view from a server-owned immutable checkout", async () => {
    const fixture = await createFixtureProject("release-intelligence", [
      {
        relativePath: ".quality/project-map.yaml",
        contents: `project:
  id: "store"
  name: "Store"
features:
  - id: "checkout"
    name: "Checkout"
    artifacts:
      quality_map_path: ".quality/evidence/checkout/quality-map.yaml"
`,
      },
      {
        relativePath: ".quality/config/views.yaml",
        contents: `views:
  - id: "web"
    name: "Web"
    feature_ids:
      - "checkout"
`,
      },
      {
        relativePath: ".quality/evidence/checkout/quality-map.yaml",
        contents: `checks_reviewed: true
target:
  id: "checkout"
  name: "Checkout"
  scope: "feature"
expectations:
  - id: "checkout-success"
    title: "Checkout succeeds"
    source_type: "SOURCE"
    category: "workflow"
    priority: "P0"
    evidence:
      - id: "checkout-contract"
        type: "contract"
        path: "tests/checkout.contract.test.ts"
        contexts:
          - "release-gate"
`,
      },
      {
        relativePath: "tests/checkout.contract.test.ts",
        contents: "export {};\n",
      },
    ]);

    try {
      const result = await compileReleaseFactsOp({
        projectPath: fixture.root,
        repository: "ShiplightAI/store",
        commitSha: "a".repeat(40),
        workflowRunId: "42",
        analyzedWorkflowPath: ".github/workflows/release.yml",
        components: ["web"],
      });

      expect(result.factIntegrity).toBe("complete");
      expect(result.features).toHaveLength(1);
      expect(result.features[0]).toMatchObject({
        key: ".quality/evidence/checkout/quality-map.yaml#target:checkout",
        name: "Checkout",
        priority: "P0",
        status: "confirmed",
        behaviors: [
          {
            key: ".quality/evidence/checkout/quality-map.yaml#expectation:checkout-success",
            origin: "explicit",
            reviewStatus: "confirmed",
            priority: "P0",
          },
        ],
      });
      expect(result.factSet).toMatchObject({
        components: ["web"],
        qualityMapCount: 1,
        observationCount: 0,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects moving refs and invalid repository coordinates before scanning", async () => {
    const input = {
      projectPath: "/not-used",
      repository: "ShiplightAI/store",
      commitSha: "main",
      workflowRunId: "42",
      analyzedWorkflowPath: ".github/workflows/release.yml",
      components: [],
    };

    await expect(compileReleaseFactsOp(input)).rejects.toThrow("full 40-character");
    await expect(
      compileReleaseFactsOp({
        ...input,
        commitSha: "a".repeat(40),
        repository: "invalid",
      }),
    ).rejects.toThrow("Invalid repository name");
  });
});
