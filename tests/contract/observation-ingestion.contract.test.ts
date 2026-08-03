import { describe, expect, it } from "vitest";
import {
  buildTargetEvaluation,
  ingestJunitXmlReport,
  ingestPlaywrightJsonReport,
  mergeObservationIngestionResults,
  normalizeObservationBatches,
  resolveObservations
} from "@shiplightai/quality-core";
import { analyticsStructuredResult } from "../fixtures/analytics/build-fixtures";
import {
  cliBrowserJunitFixture,
  cliExampleHomepagePlaywrightJsonFixture
} from "../fixtures/observations/standard-artifacts";

const targetId = "complete/quality-map.yaml#target:analytics-target";

describe("observation ingestion contract", () => {
  it("normalizes file-backed observations and resolves them onto structural evidence ids", () => {
    const ingested = normalizeObservationBatches([
      {
        source: {
          id: "github-actions",
          kind: "ci",
          label: "PR checks",
          run_id: "run-123",
          run_url: "https://example.test/runs/123"
        },
        context: "pr-ci",
        observed_at: "2026-06-07T10:00:00Z",
        revision: {
          commit: "abc123"
        },
        observations: [
          {
            test_file: "tests/contract/analytics.contract.test.ts",
            status: "pass"
          },
          {
            test_file: "docs/manual.md",
            context: "manual-review",
            observed_at: "2026-06-07T11:00:00Z",
            status: "skipped"
          }
        ]
      }
    ]);

    expect(ingested.status).toBe("valid");
    expect(ingested.observations).toHaveLength(2);
    expect(ingested.observations[0]).toEqual(
      expect.objectContaining({
        testFile: "tests/contract/analytics.contract.test.ts",
        context: "pr-ci",
        status: "pass",
        observedAt: "2026-06-07T10:00:00.000Z"
      })
    );

    const resolved = resolveObservations(analyticsStructuredResult(), ingested);
    expect(resolved.status).toBe("valid");
    expect(resolved.observations[0]).toEqual(
      expect.objectContaining({
        subjectId: targetId,
        expectationId: "complete/quality-map.yaml#expectation:p0-direct-gated",
        evidenceId: "complete/quality-map.yaml#evidence:direct-gated-proof"
      })
    );
  });

  it("falls back to test class names when the runtime artifact does not include a file path", () => {
    const ingested = normalizeObservationBatches([
      {
        context: "pr-ci",
        observed_at: "2026-06-07T10:00:00Z",
        observations: [
          {
            observation_id: "class-only",
            test_class: "analytics.contract.test.ts",
            status: "pass"
          }
        ]
      }
    ]);

    const resolved = resolveObservations(analyticsStructuredResult(), ingested);

    expect(resolved.status).toBe("valid");
    expect(resolved.observations).toHaveLength(1);
    expect(resolved.observations[0]).toEqual(
      expect.objectContaining({
        observationId: "class-only",
        evidenceLocalId: "direct-gated-proof"
      })
    );
  });

  it("keeps unknown proof sources in the audit without dropping the rest of the batch", () => {
    const ingested = normalizeObservationBatches([
      {
        context: "pr-ci",
        observed_at: "2026-06-07T10:00:00Z",
        observations: [
          {
            observation_id: "valid",
            test_file: "tests/contract/analytics.contract.test.ts",
            status: "pass"
          },
          {
            observation_id: "unknown-proof",
            test_file: "tests/contract/missing-proof.test.ts",
            status: "pass"
          }
        ]
      }
    ]);

    const resolved = resolveObservations(analyticsStructuredResult(), ingested);

    expect(resolved.status).toBe("valid");
    expect(resolved.observations.map((record) => record.observationId)).toEqual(["valid"]);
    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          observationId: "unknown-proof",
          matchStatus: "unmatched",
          testFile: "tests/contract/missing-proof.test.ts"
        })
      ])
    );
  });

  it("builds a target evaluation snapshot from structural data plus resolved observations", () => {
    const resolved = resolveObservations(
      analyticsStructuredResult(),
      normalizeObservationBatches([
        {
          context: "pr-ci",
          observed_at: "2026-06-07T10:00:00Z",
          revision: { commit: "abc123" },
          observations: [
            {
              test_file: "tests/contract/analytics.contract.test.ts",
              status: "pass"
            },
            {
              test_file: "tests/contract/accepted.test.ts",
              status: "pass"
            }
          ]
        }
      ])
    );

    const evaluation = buildTargetEvaluation({
      result: analyticsStructuredResult(),
      targetId,
      observations: resolved,
      selection: {
        commit: "abc123"
      }
    });

    expect(evaluation.state).toBe("available");
    expect(evaluation.observedState).toBe("partial");
    expect(evaluation.counts.pass).toBe(2);
    expect(evaluation.counts.unobserved).toBeGreaterThan(0);
    expect(
      evaluation.expectations.find((expectation) => expectation.expectationLocalId === "p0-direct-gated")
    ).toEqual(
      expect.objectContaining({
        structuralStatus: "COVERED",
        observedState: "pass"
      })
    );
  });

  it("reflects human review in the evaluation snapshot's per-check structure confidence", () => {
    const evaluationFor = (result: ReturnType<typeof analyticsStructuredResult>) =>
      buildTargetEvaluation({
        result,
        targetId,
        observations: resolveObservations(result, normalizeObservationBatches([])),
        selection: { commit: "x" }
      });
    const base = analyticsStructuredResult();
    const reviewed: ReturnType<typeof analyticsStructuredResult> = {
      ...base,
      qualityMaps: {
        ...base.qualityMaps,
        results: base.qualityMaps.results.map((entry) =>
          entry.graph === undefined ? entry : { ...entry, graph: { ...entry.graph, checksReviewed: true } }
        )
      }
    };

    // Unreviewed: the fixture declares no origins, so every check reads UNSPECIFIED.
    const confidenceOf = (result: ReturnType<typeof analyticsStructuredResult>, localId: string) =>
      evaluationFor(result).expectations.find((expectation) => expectation.expectationLocalId === localId)
        ?.structureConfidence;
    expect(confidenceOf(base, "p0-direct-gated")).toBe("UNSPECIFIED");

    // Reviewed (no project-map feature here, so gate 4 alone) lifts every check to HIGH,
    // while the per-check origin (structureProvenance) is unchanged.
    for (const expectation of evaluationFor(reviewed).expectations) {
      expect(expectation.structureConfidence).toBe("HIGH");
      expect(expectation.structureProvenance).toBe("unspecified");
    }
  });

  it("adapts JUnit XML into canonical file-backed observations", () => {
    const ingested = ingestJunitXmlReport({
      report_xml: cliBrowserJunitFixture,
      source: {
        id: "github-actions",
        kind: "ci",
        label: "Publish shiplightai CLI",
        run_id: "27092384832",
        run_url: "https://github.com/ShiplightAI/monots/actions/runs/27092384832"
      },
      observed_at: "2026-06-07T12:25:58Z",
      revision: {
        commit: "367a89353a3ab9cfebaf0c0a9f70dd86b89a741f"
      },
      artifact: {
        path: "/tmp/qc-observations/cli/browser-e2e.junit.xml"
      }
    });

    expect(ingested.status).toBe("valid");
    expect(ingested.observations).toHaveLength(3);
    expect(ingested.observations[0]).toEqual(
      expect.objectContaining({
        testFile: "/home/runner/work/monots/monots/apps/cli/src/commands/create.e2e.test.ts",
        testCase: "create command scaffolds a runnable project",
        context: "runtime-review",
        status: "pass",
        observedAt: "2026-06-07T12:25:58.000Z",
        artifacts: [
          expect.objectContaining({
            kind: "junit-xml",
            path: "/tmp/qc-observations/cli/browser-e2e.junit.xml"
          })
        ]
      })
    );
  });

  it("adapts Playwright JSON into canonical file-backed observations", () => {
    const ingested = ingestPlaywrightJsonReport({
      report_json: cliExampleHomepagePlaywrightJsonFixture,
      source: {
        id: "github-actions",
        kind: "ci",
        label: "Publish shiplightai CLI",
        run_id: "27092384832",
        run_url: "https://github.com/ShiplightAI/monots/actions/runs/27092384832"
      },
      revision: {
        commit: "367a89353a3ab9cfebaf0c0a9f70dd86b89a741f"
      },
      artifact: {
        path: "/tmp/qc-observations/cli/example-homepage.playwright.json"
      }
    });

    expect(ingested.status).toBe("valid");
    expect(ingested.observations).toHaveLength(2);
    expect(ingested.observations[0]).toEqual(
      expect.objectContaining({
        testFile: "tests/examples/example-homepage.yaml.spec.ts",
        testCase: "Release-gate smoke renders the example homepage",
        context: "runtime-review",
        status: "pass",
        observedAt: "2026-06-07T12:25:59.250Z",
        artifacts: [
          expect.objectContaining({
            kind: "playwright-json",
            path: "/tmp/qc-observations/cli/example-homepage.playwright.json"
          })
        ]
      })
    );
  });

  it("merges multiple artifact adapters so one evaluation can combine observations from different files", () => {
    const cli = ingestJunitXmlReport({
      report_xml: cliBrowserJunitFixture,
      observed_at: "2026-06-07T12:25:58Z"
    });
    const cliPlaywright = ingestPlaywrightJsonReport({
      report_json: cliExampleHomepagePlaywrightJsonFixture
    });

    const merged = mergeObservationIngestionResults([cli, cliPlaywright]);

    expect(merged.status).toBe("valid");
    expect(merged.observations).toHaveLength(5);
    expect(merged.observations.map((record) => record.testFile)).toEqual(
      expect.arrayContaining([
        "/home/runner/work/monots/monots/apps/cli/src/commands/create.e2e.test.ts",
        "tests/examples/example-homepage.yaml.spec.ts"
      ])
    );
  });
});
