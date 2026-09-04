import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMarkdownFallbackBatch,
  buildShiplightObservationBatch,
  buildTargetEvaluation,
  executeObservationSourceProfile,
  ingestObservationManifest,
  parseObservationSourceProfiles,
  parseQualityObservationManifest,
  resolveObservations,
  type HostObservationTransportRegistry,
  type ObservationSourceProfile
} from "@shiplightai/quality-core";
import { parseQualityMaps, type QualityMapSource } from "@shiplightai/quality-map";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { projectIndexScanResult } from "../fixtures/project-index/build-fixtures";

const checksFixtureRoot = path.resolve("tests/fixtures/observations/checks");

function checksScanResult() {
  const source: QualityMapSource = {
    projectRelativePath: "checks/quality-map.yaml",
    resolvedLocalPath: path.join(checksFixtureRoot, "quality-map.yaml"),
    targetCandidateId: "ci-runner",
    sourcePattern: "tests/fixtures/observations/checks/**/quality-map.yaml"
  };
  const qualityMaps = parseQualityMaps([source]);
  return projectIndexScanResult({
    qualityMaps,
    markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
  });
}

// Run evidence is the pointer a producer keeps for one result — the video, the
// report, the run page. Quality records it and shows it; it never interprets it.
// These tests pin that boundary: what the contract accepts, that an opaque ref
// survives ingestion unchanged, and that a bad pointer never costs us the
// pass/fail fact it was attached to.

function manifest(observations: readonly Record<string, unknown>[]): string {
  return JSON.stringify({
    schema_version: 1,
    revision: { commit: "abc123", branch: "main" },
    run: { id: "run-42", url: "https://ci.example.test/runs/42" },
    observed_at: "2026-08-27T10:00:00Z",
    observations
  });
}

const SHIPLIGHT_REF = "https://app.shiplight.ai/runs/8412?test=99231";

describe("observation run evidence contract", () => {
  it("carries an opaque artifact ref from the manifest onto the ingested observation", () => {
    const result = ingestObservationManifest({
      report_json: manifest([
        {
          path: "tests/checkout.yaml",
          test_case: "guest can pay",
          status: "pass",
          artifacts: [{ ref: SHIPLIGHT_REF, label: "Shiplight run 8412" }]
        }
      ]),
      source: { id: "shiplight", kind: "host", label: "Shiplight" }
    });

    expect(result.status).toBe("valid");
    expect(result.diagnostics).toEqual([]);
    expect(result.observations[0]?.evidenceRefs).toEqual([
      { ref: SHIPLIGHT_REF, label: "Shiplight run 8412" }
    ]);
  });

  it("records a ref that is not a URL without rewriting or resolving it", () => {
    // A local report path is as valid a ref as a URL. The engine must not try to
    // turn it into one — only the integration that wrote it knows what it means.
    const localRef = "test-results/checkout/index.html";
    const result = ingestObservationManifest({
      report_json: manifest([
        { path: "tests/checkout.yaml", status: "pass", artifacts: [{ ref: localRef }] }
      ])
    });

    expect(result.observations[0]?.evidenceRefs).toEqual([{ ref: localRef }]);
  });

  it("leaves an observation with no artifacts carrying an empty ref list", () => {
    const result = ingestObservationManifest({
      report_json: manifest([{ path: "tests/checkout.yaml", status: "pass" }])
    });

    expect(result.observations[0]?.evidenceRefs).toEqual([]);
  });

  it("keeps the observed result when an evidence pointer is malformed", () => {
    // The status is the measurement; the ref is only how a reviewer looks at it.
    // Dropping a real pass because its video pointer was malformed would trade a
    // measurement for a convenience.
    const result = ingestObservationManifest({
      report_json: manifest([
        { path: "tests/checkout.yaml", test_case: "guest can pay", status: "fail", artifacts: [{ ref: "" }] }
      ])
    });

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.status).toBe("fail");
    expect(result.observations[0]?.evidenceRefs).toEqual([]);
    expect(result.diagnostics.map((entry) => entry.severity)).toEqual(["warning"]);
    expect(result.diagnostics[0]?.message).toContain("requires a non-empty ref");
  });

  it("rejects an artifact entry carrying unknown fields rather than ignoring them", () => {
    // additionalProperties: false all the way down. A producer inventing a field
    // must hear about it, not have it silently dropped.
    const parsed = parseQualityObservationManifest(
      manifest([
        {
          path: "tests/checkout.yaml",
          status: "pass",
          artifacts: [{ ref: SHIPLIGHT_REF, kind: "video" }]
        }
      ])
    );

    expect(parsed.status).toBe("invalid");
    expect(parsed.diagnostics[0]?.message).toContain("unknown fields");
    expect(parsed.diagnostics[0]?.message).toContain("kind");
  });

  it("fails validation when an artifact entry has no ref", () => {
    const parsed = parseQualityObservationManifest(
      manifest([{ path: "tests/checkout.yaml", status: "pass", artifacts: [{ label: "video" }] }])
    );

    expect(parsed.status).toBe("invalid");
    expect(parsed.diagnostics[0]?.severity).toBe("error");
  });

  it("round-trips artifacts through a parsed manifest document", () => {
    const parsed = parseQualityObservationManifest(
      manifest([
        {
          path: "tests/checkout.yaml",
          status: "pass",
          artifacts: [{ ref: SHIPLIGHT_REF, label: "Shiplight run 8412" }]
        }
      ])
    );

    expect(parsed.status).toBe("valid");
    expect(parsed.document?.observations[0]?.artifacts).toEqual([
      { ref: SHIPLIGHT_REF, label: "Shiplight run 8412" }
    ]);
  });
});

function hostProfile(overrides: Partial<ObservationSourceProfile> = {}): ObservationSourceProfile {
  return {
    id: "shiplight-e2e",
    name: "Shiplight e2e runs",
    transport: "host",
    requiredEnv: [],
    sourceRefs: [],
    host: { provider: "shiplight", options: { repo: "ShiplightAI/shipyard" } },
    ...overrides
  };
}

describe("host observation transport contract", () => {
  it("runs a registered host provider and normalizes what it returns", async () => {
    const hostTransports: HostObservationTransportRegistry = {
      shiplight: async ({ profile, selection }) => ({
        batches: [
          {
            source: { id: profile.id, kind: "host", label: profile.name },
            revision: { commit: selection?.commit ?? "abc123" },
            observed_at: "2026-08-27T10:00:00Z",
            observations: [
              {
                test_file: "tests/checkout.yaml",
                test_case: "guest can pay",
                status: "pass",
                observed_at: "2026-08-27T10:00:00Z",
                evidence_refs: [{ ref: SHIPLIGHT_REF, label: "Shiplight run 8412" }]
              }
            ]
          }
        ],
        selectedRun: { runId: 8412, runUrl: "https://app.shiplight.ai/runs/8412", commit: "abc123" }
      })
    };

    const result = await executeObservationSourceProfile({
      profile: hostProfile(),
      selection: { commit: "abc123" },
      hostTransports
    });

    expect(result.status).toBe("valid");
    expect(result.diagnostics).toEqual([]);
    expect(result.transport).toBe("host");
    expect(result.selectedRun?.runId).toBe(8412);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.evidenceRefs).toEqual([
      { ref: SHIPLIGHT_REF, label: "Shiplight run 8412" }
    ]);
  });

  it("applies the same record validation to host records as to a parsed manifest", async () => {
    // The seam is fetch-and-shape only. A host cannot get a record past a check
    // that a file-based transport must pass, or it would become a second, softer
    // way into a score.
    const hostTransports: HostObservationTransportRegistry = {
      shiplight: async () => ({
        batches: [
          {
            source: { id: "shiplight", kind: "host" },
            revision: { commit: "abc123" },
            observed_at: "2026-08-27T10:00:00Z",
            observations: [
              { test_file: "tests/checkout.yaml", status: "passed", observed_at: "2026-08-27T10:00:00Z" }
            ]
          }
        ]
      })
    };

    const result = await executeObservationSourceProfile({
      profile: hostProfile(),
      hostTransports
    });

    expect(result.observations).toEqual([]);
    expect(result.diagnostics.some((entry) => entry.message.includes("status"))).toBe(true);
  });

  it("names the registered providers when the declared one is not available here", async () => {
    // The OSS CLI reading a config written for the hosted app hits this. It has
    // to be able to tell "this reader cannot serve that provider" from "typo".
    const result = await executeObservationSourceProfile({
      profile: hostProfile(),
      hostTransports: { "some-other-host": async () => ({ batches: [] }) }
    });

    expect(result.status).toBe("invalid");
    expect(result.observations).toEqual([]);
    expect(result.diagnostics[0]?.message).toContain("shiplight");
    expect(result.diagnostics[0]?.message).toContain("some-other-host");
  });

  it("reports a provider with no registry at all rather than returning an empty pass", async () => {
    const result = await executeObservationSourceProfile({ profile: hostProfile() });

    expect(result.status).toBe("invalid");
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.diagnostics[0]?.message).toContain("(none)");
  });

  it("turns a throwing host provider into a diagnostic instead of an unhandled rejection", async () => {
    const result = await executeObservationSourceProfile({
      profile: hostProfile(),
      hostTransports: {
        shiplight: async () => {
          throw new Error("shiplight API returned 503");
        }
      }
    });

    expect(result.status).toBe("invalid");
    expect(result.diagnostics[0]?.message).toContain("shiplight API returned 503");
  });

  it("parses a host profile from config without requiring an observation path", async () => {
    const fixture = await createFixtureProject("observation-source-host-transport", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "shiplight-e2e"
    name: "Shiplight e2e runs"
    description: "Read YAML e2e results already reported to the platform."
    transport: "host"
    host:
      provider: "shiplight"
      options:
        repo: "ShiplightAI/shipyard"
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

      expect(batch.primary?.status).toBe("parsed");
      expect(batch.primary?.document?.profiles[0]).toEqual(
        expect.objectContaining({
          id: "shiplight-e2e",
          transport: "host",
          observationPath: undefined,
          host: { provider: "shiplight", options: { repo: "ShiplightAI/shipyard" } }
        })
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects a host profile with no provider", async () => {
    const fixture = await createFixtureProject("observation-source-host-no-provider", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "shiplight-e2e"
    name: "Shiplight e2e runs"
    transport: "host"
    host:
      options:
        repo: "ShiplightAI/shipyard"
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

      expect(batch.primary?.document?.profiles ?? []).toEqual([]);
      expect(batch.primary?.diagnostics[0]?.message).toContain("host block with a provider");
    } finally {
      await fixture.cleanup();
    }
  });

  it("still requires an observation path for the file-based transports", async () => {
    const fixture = await createFixtureProject("observation-source-missing-path", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-review"
    name: "Local review"
    transport: "local-folder"
    local_folder:
      path: "artifacts/quality"
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

      expect(batch.primary?.document?.profiles ?? []).toEqual([]);
      expect(batch.primary?.diagnostics[0]?.message).toContain("observation_path");
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("run evidence through resolution and evaluation", () => {
  const agentPayloadRef = "https://app.shiplight.ai/runs/8412?test=99231";

  function resolvedFixture() {
    const ingested = ingestObservationManifest({
      report_json: JSON.stringify({
        schema_version: 1,
        revision: { commit: "abc123" },
        observed_at: "2026-08-27T10:00:00Z",
        observations: [
          {
            path: ".github/workflows/release-ci-runner.yml",
            test_case: "agent_payload",
            status: "pass",
            artifacts: [{ ref: agentPayloadRef, label: "Shiplight run 8412" }]
          },
          {
            path: ".github/workflows/release-ci-runner.yml",
            test_case: "image_inspect",
            status: "pass"
          }
        ]
      })
    });

    return { scan: checksScanResult(), resolution: resolveObservations(checksScanResult(), ingested) };
  }

  it("carries refs onto the audit row for the observation that declared them", () => {
    const { resolution } = resolvedFixture();
    const matched = resolution.auditRows.filter((row) => row.matchStatus === "matched");

    expect(matched.length).toBeGreaterThan(0);
    const withRefs = matched.filter((row) => row.evidenceRefs.length > 0);
    expect(withRefs.map((row) => row.testCase)).toEqual(["agent_payload"]);
    expect(withRefs[0]?.evidenceRefs).toEqual([{ ref: agentPayloadRef, label: "Shiplight run 8412" }]);
  });

  it("leaves the audit row of an observation with no refs carrying an empty list", () => {
    const { resolution } = resolvedFixture();
    const imageInspect = resolution.auditRows.find((row) => row.testCase === "image_inspect");

    expect(imageInspect?.evidenceRefs).toEqual([]);
  });

  it("exposes the selected observation's refs on the evaluated check", () => {
    const { scan, resolution } = resolvedFixture();
    const evaluation = buildTargetEvaluation({
      result: scan,
      targetId: "checks/quality-map.yaml#target:ci-runner",
      observations: resolution,
      selection: { commit: "abc123" }
    });

    const evidence = evaluation.expectations.flatMap((expectation) => expectation.evidence);
    const agentPayload = evidence.find((entry) => entry.evidenceLocalId === "ci-runner-agent-payload");
    const imageInspect = evidence.find((entry) => entry.evidenceLocalId === "ci-runner-image-inspect");

    expect(agentPayload?.evidenceRefs).toEqual([{ ref: agentPayloadRef, label: "Shiplight run 8412" }]);
    expect(imageInspect?.evidenceRefs).toEqual([]);
  });

  it("reports no refs for a check nothing observed", () => {
    // An unobserved check must not borrow evidence from a check that did run.
    const { scan, resolution } = resolvedFixture();
    const evaluation = buildTargetEvaluation({
      result: scan,
      targetId: "checks/quality-map.yaml#target:ci-runner",
      observations: resolution,
      selection: { commit: "abc123" }
    });

    const unobserved = evaluation.expectations
      .flatMap((expectation) => expectation.evidence)
      .filter((entry) => entry.state === "unobserved");

    expect(unobserved.length).toBeGreaterThan(0);
    expect(unobserved.every((entry) => entry.evidenceRefs.length === 0)).toBe(true);
  });
});

// A Shiplight YAML run transpiles to Playwright and reports the GENERATED spec.
// That file is gitignored and absent from a fresh checkout, so a quality map
// cannot honestly pin it — the adapter keys observations on the `.test.yaml`
// source instead, inverting the transpiler's own naming rule.
describe("shiplight report adapter", () => {
  function report(tests: readonly Record<string, unknown>[]): string {
    return JSON.stringify({ timestamp: "2026-08-28T10:00:00.000Z", tests });
  }

  it("keys an observation on the YAML source, not the transpiled spec", () => {
    const built = buildShiplightObservationBatch({
      report_json: report([
        {
          file: "tests/authed/home-analytics-hover-nav.yaml.spec.ts",
          baseTitle: "Home cards and charts expose analytics hover navigation",
          title: "@e2e @home Home cards and charts expose analytics hover navigation",
          status: "passed",
          endTime: "2026-08-28T09:59:00.000Z"
        }
      ])
    });

    expect(built.diagnostics).toEqual([]);
    expect(built.batch?.observations?.[0]).toEqual(
      expect.objectContaining({
        test_file: "tests/authed/home-analytics-hover-nav.test.yaml",
        // The bare YAML test name, not the tag-prefixed title: a map is authored
        // against the YAML, and tags are prefixed rather than joined by the
        // suite separator the resolver folds on, so the tagged form would miss.
        test_case: "Home cards and charts expose analytics hover navigation",
        status: "pass"
      })
    );
  });

  it("leaves a path that is not a transpiled spec untouched", () => {
    const built = buildShiplightObservationBatch({
      report_json: report([
        { file: "tests/authed/auth.setup.ts", title: "signup new authed user", status: "passed" }
      ])
    });

    expect(built.batch?.observations?.[0]?.test_file).toBe("tests/authed/auth.setup.ts");
  });

  it("carries the run evidence ref onto every observation", () => {
    const built = buildShiplightObservationBatch({
      report_json: report([
        { file: "a.yaml.spec.ts", baseTitle: "a", status: "passed" },
        { file: "b.yaml.spec.ts", baseTitle: "b", status: "failed" }
      ]),
      evidence_refs: [{ ref: "https://app.shiplight.ai/runs/8412", label: "Shiplight run 8412" }]
    });

    expect(built.batch?.observations?.map((o) => o.status)).toEqual(["pass", "fail"]);
    for (const observation of built.batch?.observations ?? []) {
      expect(observation.evidence_refs).toEqual([
        { ref: "https://app.shiplight.ai/runs/8412", label: "Shiplight run 8412" }
      ]);
    }
  });

  it("skips a test with no usable file or status without losing the rest", () => {
    const built = buildShiplightObservationBatch({
      report_json: report([
        { file: "a.yaml.spec.ts", baseTitle: "a", status: "nonsense" },
        { file: "b.yaml.spec.ts", baseTitle: "b", status: "passed" }
      ])
    });

    expect(built.batch?.observations).toHaveLength(1);
    expect(built.diagnostics.map((entry) => entry.severity)).toEqual(["warning"]);
  });

  it("rejects a report with no tests array", () => {
    const built = buildShiplightObservationBatch({ report_json: JSON.stringify({ timestamp: "x" }) });

    expect(built.batch).toBeUndefined();
    expect(built.diagnostics[0]?.severity).toBe("error");
  });
});
