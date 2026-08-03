import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTargetEvaluation,
  ingestJunitXmlReport,
  ingestPlaywrightJsonReport,
  mergeObservationIngestionResults,
  normalizeObservationBatches,
  scanProject,
  resolveObservations
} from "@shiplightai/quality-core";
import { analyticsStructuredResult } from "../fixtures/analytics/build-fixtures";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import {
  publishCliRunFixture,
  publishMcpRunFixture
} from "../fixtures/observations/github-actions";
import {
  cliBrowserJunitFixture,
  cliExampleHomepagePlaywrightJsonFixture,
  mcpBrowserJunitFixture
} from "../fixtures/observations/standard-artifacts";

const targetId = "complete/quality-map.yaml#target:analytics-target";

describe("observation ingestion integration", () => {
  it("selects the latest matching observation per evidence within a context and commit", () => {
    const result = analyticsStructuredResult();
    const resolved = resolveObservations(
      result,
      normalizeObservationBatches([
        {
          source: { id: "local-run", kind: "local" },
          observations: [
            {
              observation_id: "older-fail",
              test_file: "tests/contract/analytics.contract.test.ts",
              context: "pr-ci",
              status: "fail",
              observed_at: "2026-06-07T09:00:00Z",
              revision: { commit: "abc123" }
            },
            {
              observation_id: "newer-pass",
              test_file: "tests/contract/analytics.contract.test.ts",
              context: "pr-ci",
              status: "pass",
              observed_at: "2026-06-07T10:00:00Z",
              revision: { commit: "abc123" }
            },
            {
              observation_id: "other-commit",
              test_file: "tests/contract/analytics.contract.test.ts",
              context: "pr-ci",
              status: "fail",
              observed_at: "2026-06-07T11:00:00Z",
              revision: { commit: "def456" }
            }
          ]
        }
      ])
    );

    const latest = buildTargetEvaluation({
      result,
      targetId,
      observations: resolved,
      selection: {
        commit: "abc123"
      }
    });
    const asOfEarlier = buildTargetEvaluation({
      result,
      targetId,
      observations: resolved,
      selection: {
        commit: "abc123",
        asOf: "2026-06-07T09:30:00Z"
      }
    });

    expect(
      latest.expectations.find((expectation) => expectation.expectationLocalId === "p0-direct-gated")?.evidence[0]
    ).toEqual(
      expect.objectContaining({
        observationId: "newer-pass",
        state: "pass"
      })
    );
    expect(
      asOfEarlier.expectations.find((expectation) => expectation.expectationLocalId === "p0-direct-gated")?.evidence[0]
    ).toEqual(
      expect.objectContaining({
        observationId: "older-fail",
        state: "fail"
      })
    );
  });

  it("keeps evaluator logic independent from raw source shape by requiring normalized observations", () => {
    const result = analyticsStructuredResult();
    const ingested = normalizeObservationBatches([
      {
        source: {
          id: "staging-gate",
          kind: "ci",
          run_id: "run-789",
          run_url: "https://example.test/runs/789"
        },
        observations: [
          {
            test_file: "tests/e2e/analytics.spec.ts",
            context: "staging-gate",
            status: "error",
            observed_at: "2026-06-07T12:00:00Z",
            revision: { commit: "abc123" }
          }
        ]
      }
    ]);
    const resolved = resolveObservations(result, ingested);

    const evaluation = buildTargetEvaluation({
      result,
      targetId,
      observations: resolved,
      selection: {
        commit: "abc123"
      }
    });

    expect(evaluation.observedState).toBe("error");
    expect(
      evaluation.expectations.find((expectation) => expectation.expectationLocalId === "p1-stale")
    ).toEqual(
      expect.objectContaining({
        observedState: "error",
        evidence: [
          expect.objectContaining({
            runUrl: "https://example.test/runs/789",
            state: "error"
          })
        ]
      })
    );
  });

  it("combines release JUnit artifacts without over-claiming missing unit proof", async () => {
    const fixture = await createFixtureProject("observation-release-fixtures", [
      {
        relativePath: path.join(".quality", "evidence", "002-shiplightai-cli", "quality-map.yaml"),
        contents: `target:
  id: "002-shiplightai-cli"
  name: "shiplightai CLI & Playwright Library"
  scope: "feature"
expectations:
  - id: "exp-allowlist"
    title: "Allowlist unit proof"
    source_type: "IMPLEMENTATION"
    category: "security"
    priority: "P1"
    risk:
      weight: 4
      rationale: "Release review still needs deterministic env-boundary proof."
    evidence:
      - id: "ev-allowlist-unit"
        type: "unit"
        path: "apps/cli/src/fixture.allowlist.test.ts"
        command: "cd apps/cli && pnpm test:unit"
        contexts:
          - "pr-ci"
  - id: "exp-transpile"
    title: "Transpile logic proof"
    source_type: "IMPLEMENTATION"
    category: "other"
    priority: "P1"
    risk:
      weight: 4
      rationale: "Release review still needs deterministic YAML-to-spec proof."
    evidence:
      - id: "ev-transpile-logic"
        type: "integration"
        path: "apps/cli/tests/integration/transpile-pipeline.test.ts"
        command: "cd apps/cli && pnpm test:logic"
        contexts:
          - "pr-ci"
  - id: "exp-create-browser"
    title: "Scaffold browser proof"
    source_type: "IMPLEMENTATION"
    category: "other"
    priority: "P1"
    risk:
      weight: 4
      rationale: "The browser-backed scaffold lane should resolve from the release artifact."
    evidence:
      - id: "ev-create-e2e"
        type: "e2e"
        path: "apps/cli/src/commands/create.e2e.test.ts"
        command: "cd apps/cli && pnpm test:browser"
        contexts:
          - "pr-ci"
  - id: "exp-test-run-browser"
    title: "Failure propagation browser proof"
    source_type: "IMPLEMENTATION"
    category: "other"
    priority: "P1"
    risk:
      weight: 4
      rationale: "The release artifact should cover exit-code propagation."
    evidence:
      - id: "ev-test-run-e2e"
        type: "e2e"
        path: "apps/cli/src/commands/test-run.e2e.test.ts"
        command: "cd apps/cli && pnpm test:browser"
        contexts:
          - "pr-ci"
  - id: "exp-test-vars-browser"
    title: "Variable browser proof"
    source_type: "IMPLEMENTATION"
    category: "other"
    priority: "P1"
    risk:
      weight: 4
      rationale: "The browser-backed variable path should be observed when release artifacts exist."
    evidence:
      - id: "ev-test-vars-e2e"
        type: "e2e"
        path: "apps/cli/src/commands/test.vars.e2e.test.ts"
        command: "cd apps/cli && pnpm test:browser"
        contexts:
          - "pr-ci"
`
      },
      {
        relativePath: "apps/cli/src/fixture.allowlist.test.ts",
        contents: "export {};\n"
      },
      {
        relativePath: "apps/cli/tests/integration/transpile-pipeline.test.ts",
        contents: "export {};\n"
      },
      {
        relativePath: "apps/cli/src/commands/create.e2e.test.ts",
        contents: "export {};\n"
      },
      {
        relativePath: "apps/cli/src/commands/test-run.e2e.test.ts",
        contents: "export {};\n"
      },
      {
        relativePath: "apps/cli/src/commands/test.vars.e2e.test.ts",
        contents: "export {};\n"
      },
      {
        relativePath: path.join(".quality", "evidence", "003-shiplightai-mcp-server", "quality-map.yaml"),
        contents: `target:
  id: "003-shiplightai-mcp-server"
  name: "@shiplightai/mcp UI-Automation Server"
  scope: "feature"
expectations:
  - id: "exp-browser-tools"
    title: "Browser tools behavior"
    source_type: "IMPLEMENTATION"
    category: "api"
    priority: "P0"
    risk:
      weight: 5
      rationale: "Release-critical browser behavior needs a dedicated browser lane."
    evidence:
      - id: "ev-browser-behavior"
        type: "e2e"
        path: "packages/mcp-tools/browser-tests/browserTools.behavior.test.ts"
        command: "pnpm --filter mcp-tools test:browser"
        contexts:
          - "pr-ci"
  - id: "exp-cloud-gate"
    title: "Cloud token gating"
    source_type: "IMPLEMENTATION"
    category: "security"
    priority: "P1"
    risk:
      weight: 4
      rationale: "This unit lane is not represented in the browser artifact."
    evidence:
      - id: "ev-cloud-gate-unit"
        type: "unit"
        path: "packages/mcp-tools/src/tools/__tests__/cloudTokenGating.test.ts"
        command: "pnpm --filter mcp-tools test:unit"
        contexts:
          - "pr-ci"
  - id: "exp-stdio"
    title: "Stdio transport guards"
    source_type: "IMPLEMENTATION"
    category: "ops"
    priority: "P1"
    risk:
      weight: 4
      rationale: "apps/mcp-server unit proof is still missing from the browser artifact."
    evidence:
      - id: "ev-stdio-unit"
        type: "unit"
        path: "apps/mcp-server/src/stdioGuards.test.ts"
        command: "cd apps/mcp-server && pnpm test:unit"
        contexts:
          - "pr-ci"
  - id: "exp-session-lifecycle"
    title: "Session lifecycle browser proof"
    source_type: "IMPLEMENTATION"
    category: "ops"
    priority: "P1"
    risk:
      weight: 4
      rationale: "Session lifecycle needs a real browser observation."
    evidence:
      - id: "ev-session-lifecycle-browser"
        type: "e2e"
        path: "packages/mcp-tools/browser-tests/browserTools.behavior.test.ts"
        command: "pnpm --filter mcp-tools test:browser"
        contexts:
          - "pr-ci"
  - id: "exp-log-capture"
    title: "Browser log capture proof"
    source_type: "IMPLEMENTATION"
    category: "ops"
    priority: "P1"
    risk:
      weight: 4
      rationale: "Log capture should be observed from the release browser lane."
    evidence:
      - id: "ev-logcap-browser"
        type: "e2e"
        path: "packages/mcp-tools/browser-tests/browserTools.behavior.test.ts"
        command: "pnpm --filter mcp-tools test:browser"
        contexts:
          - "pr-ci"
`
      },
      {
        relativePath: "packages/mcp-tools/browser-tests/browserTools.behavior.test.ts",
        contents: "export {};\n"
      },
      {
        relativePath: "packages/mcp-tools/src/tools/__tests__/cloudTokenGating.test.ts",
        contents: "export {};\n"
      },
      {
        relativePath: "apps/mcp-server/src/stdioGuards.test.ts",
        contents: "export {};\n"
      }
    ]);

    try {
      const result = await scanProject({
        projectPath: fixture.root,
        mode: "scan"
      });

      const merged = mergeObservationIngestionResults([
        ingestJunitXmlReport({
          report_xml: cliBrowserJunitFixture,
          source: {
            id: "github-actions",
            kind: "ci",
            label: publishCliRunFixture.workflowName,
            run_id: String(publishCliRunFixture.databaseId),
            run_url: publishCliRunFixture.url
          },
          observed_at: "2026-06-07T12:25:58Z",
          revision: {
            commit: publishCliRunFixture.headSha
          },
          artifact: {
            path: "/tmp/qc-observations/cli/browser-e2e.junit.xml"
          }
        }),
        ingestJunitXmlReport({
          report_xml: mcpBrowserJunitFixture,
          source: {
            id: "github-actions",
            kind: "ci",
            label: publishMcpRunFixture.workflowName,
            run_id: String(publishMcpRunFixture.databaseId),
            run_url: publishMcpRunFixture.url
          },
          observed_at: "2026-06-06T07:19:16Z",
          revision: {
            commit: publishMcpRunFixture.headSha
          },
          artifact: {
            path: "/tmp/qc-observations/mcp/browser-tests.junit.xml"
          }
        })
      ]);

      const resolved = resolveObservations(result, merged);
      const cliEvaluation = buildTargetEvaluation({
        result,
        targetId: ".quality/evidence/002-shiplightai-cli/quality-map.yaml#target:002-shiplightai-cli",
        observations: resolved,
        selection: {
          commit: publishCliRunFixture.headSha
        }
      });
      const mcpEvaluation = buildTargetEvaluation({
        result,
        targetId: ".quality/evidence/003-shiplightai-mcp-server/quality-map.yaml#target:003-shiplightai-mcp-server",
        observations: resolved,
        selection: {
          commit: publishMcpRunFixture.headSha
        }
      });

      expect(result.status).toBe("completed");
      expect(resolved.status).toBe("valid");

      expect(cliEvaluation.observedState).toBe("partial");
      expect(cliEvaluation.counts.pass).toBe(3);
      expect(cliEvaluation.counts.unobserved).toBe(2);
      expect(cliEvaluation.expectations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            expectationLocalId: "exp-allowlist",
            observedState: "unobserved"
          }),
          expect.objectContaining({
            expectationLocalId: "exp-transpile",
            observedState: "unobserved"
          }),
          expect.objectContaining({
            expectationLocalId: "exp-create-browser",
            observedState: "pass"
          }),
          expect.objectContaining({
            expectationLocalId: "exp-test-run-browser",
            observedState: "pass"
          }),
          expect.objectContaining({
            expectationLocalId: "exp-test-vars-browser",
            observedState: "pass"
          })
        ])
      );

      expect(mcpEvaluation.observedState).toBe("partial");
      expect(mcpEvaluation.counts.pass).toBe(3);
      expect(mcpEvaluation.counts.unobserved).toBe(2);
      expect(mcpEvaluation.expectations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            expectationLocalId: "exp-cloud-gate",
            observedState: "unobserved"
          }),
          expect.objectContaining({
            expectationLocalId: "exp-browser-tools",
            observedState: "pass"
          }),
          expect.objectContaining({
            expectationLocalId: "exp-stdio",
            observedState: "unobserved"
          }),
          expect.objectContaining({
            expectationLocalId: "exp-session-lifecycle",
            observedState: "pass"
          }),
          expect.objectContaining({
            expectationLocalId: "exp-log-capture",
            observedState: "pass"
          })
        ])
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("resolves Playwright JSON artifacts into evaluation-ready observations", async () => {
    const fixture = await createFixtureProject("observation-playwright-json", [
      {
        relativePath: path.join(".quality", "evidence", "002-shiplightai-cli", "quality-map.yaml"),
        contents: `target:
  id: "002-shiplightai-cli"
  name: "shiplightai CLI & Playwright Library"
  scope: "feature"
expectations:
  - id: "exp-example-homepage"
    title: "Release example homepage smoke"
    source_type: "IMPLEMENTATION"
    category: "other"
    priority: "P1"
    risk:
      weight: 3
      rationale: "Release YAML examples should surface as structured proof when their JSON artifact is available."
    evidence:
      - id: "ev-example-homepage-release"
        type: "e2e"
        path: "tests/examples/example-homepage.yaml.spec.ts"
        command: "pnpm exec playwright test -c playwright.config.ts tests/examples/example-homepage.yaml.spec.ts"
        contexts:
          - "release-gate"
`
      },
      {
        relativePath: "tests/examples/example-homepage.yaml.spec.ts",
        contents: "export {};\n"
      }
    ]);

    try {
      const result = await scanProject({
        projectPath: fixture.root,
        mode: "scan"
      });

      const ingested = ingestPlaywrightJsonReport({
        report_json: cliExampleHomepagePlaywrightJsonFixture,
        source: {
          id: "github-actions",
          kind: "ci",
          label: publishCliRunFixture.workflowName,
          run_id: String(publishCliRunFixture.databaseId),
          run_url: publishCliRunFixture.url
        },
        revision: {
          commit: publishCliRunFixture.headSha
        },
        artifact: {
          path: "/tmp/qc-observations/cli/example-homepage.playwright.json"
        }
      });
      const resolved = resolveObservations(result, ingested);
      const evaluation = buildTargetEvaluation({
        result,
        targetId: ".quality/evidence/002-shiplightai-cli/quality-map.yaml#target:002-shiplightai-cli",
        observations: resolved,
        selection: {
          commit: publishCliRunFixture.headSha
        }
      });

      expect(ingested.status).toBe("valid");
      expect(resolved.status).toBe("valid");
      expect(evaluation.observedState).toBe("pass");
      expect(evaluation.counts.pass).toBe(1);
      expect(evaluation.expectations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            expectationLocalId: "exp-example-homepage",
            observedState: "pass"
          })
        ])
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
