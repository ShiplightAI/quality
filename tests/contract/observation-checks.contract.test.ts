import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMarkdownFallbackBatch, ingestObservationManifest, resolveObservations } from "@shiplightai/quality-core";
import { parseQualityMaps, type QualityMapSource } from "@shiplightai/quality-map";
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

function manifest(observations: readonly Record<string, unknown>[], runId?: string): string {
  return JSON.stringify({
    schema_version: 1,
    revision: { commit: "abc123" },
    ...(runId === undefined ? {} : { run: { id: runId } }),
    observed_at: "2026-06-07T10:00:00Z",
    observations
  });
}

describe("canonical observation manifest", () => {
  it("normalizes a check with a canonical status and test_case", () => {
    const ingested = ingestObservationManifest({
      report_json: manifest([
        {
          path: ".github/workflows/release-ci-runner.yml",
          test_case: "agent_payload",
          status: "pass"
        }
      ])
    });

    expect(ingested.status).toBe("valid");
    expect(ingested.observations).toHaveLength(1);
    expect(ingested.observations[0]).toEqual(
      expect.objectContaining({
        testFile: ".github/workflows/release-ci-runner.yml",
        testCase: "agent_payload",
        context: "runtime-review",
        status: "pass",
        observedAt: "2026-06-07T10:00:00.000Z"
      })
    );
  });

  it("accepts the versioned object-with-observations envelope", () => {
    const ingested = ingestObservationManifest({
      report_json: manifest([{ path: ".github/workflows/release-vm-image.yml", status: "pass" }])
    });

    expect(ingested.status).toBe("valid");
    expect(ingested.observations[0]?.status).toBe("pass");
  });

  it("keeps usable records when neighboring entries violate the canonical contract", () => {
    const ingested = ingestObservationManifest({
      report_json: manifest([
        {
          path: ".github/workflows/release-ci-runner.yml",
          test_case: "agent_payload",
          status: "pass"
        },
        { test_case: "no_file", status: "pass" },
        { path: ".github/workflows/release-ci-runner.yml", status: "huh" }
      ])
    });

    expect(ingested.status).toBe("partial");
    expect(ingested.observations).toHaveLength(1);
    expect(ingested.observations[0]).toEqual(
      expect.objectContaining({
        testCase: "agent_payload",
        status: "pass"
      })
    );
    expect(ingested.diagnostics).toHaveLength(2);
    expect(ingested.diagnostics.every((entry) => entry.severity === "warning")).toBe(true);
  });

  it("reports invalid JSON as an invalid ingestion", () => {
    const ingested = ingestObservationManifest({
      report_json: "{not json"
    });

    expect(ingested.status).toBe("invalid");
    expect(ingested.observations).toHaveLength(0);
  });

  it("gives records from different artifacts in the same run distinct observation ids", () => {
    const source = { run_id: "run-1" };
    const records = manifest([{ path: ".github/workflows/release.yml", test_case: "build", status: "pass" }], "run-1");
    const a = ingestObservationManifest({
      report_json: records,
      source,
      artifact: { path: "a.json" }
    });
    const b = ingestObservationManifest({
      report_json: records,
      source,
      artifact: { path: "b.json" }
    });
    expect(a.observations[0]?.observationId).toBeDefined();
    expect(a.observations[0]?.observationId).not.toBe(b.observations[0]?.observationId);
  });
});

describe("check evidence resolution", () => {
  it("joins pinned checks on the same workflow file to distinct evidence by test_case (case-insensitive)", () => {
    const ingested = ingestObservationManifest({
      report_json: manifest([
        {
          path: ".github/workflows/release-ci-runner.yml",
          test_case: "Agent_Payload",
          status: "pass"
        },
        {
          path: ".github/workflows/release-ci-runner.yml",
          test_case: "IMAGE_INSPECT",
          status: "pass"
        }
      ])
    });

    const resolved = resolveObservations(checksScanResult(), ingested);

    expect(resolved.status).toBe("valid");
    expect(resolved.observations).toHaveLength(2);
    expect(resolved.observations.map((record) => record.evidenceLocalId).sort()).toEqual([
      "ci-runner-agent-payload",
      "ci-runner-image-inspect"
    ]);
  });

  it("matches a file-level (unpinned) check regardless of the observation test_case", () => {
    const ingested = ingestObservationManifest({
      report_json: manifest([{ path: ".github/workflows/release-vm-image.yml", test_case: "whatever", status: "pass" }])
    });

    const resolved = resolveObservations(checksScanResult(), ingested);

    expect(resolved.status).toBe("valid");
    expect(resolved.observations[0]?.evidenceLocalId).toBe("vm-testbox-health");
  });

  it("does not match a pinned check when the observation carries no test_case", () => {
    const ingested = ingestObservationManifest({
      report_json: manifest([{ path: ".github/workflows/release-ci-runner.yml", status: "pass" }])
    });

    const resolved = resolveObservations(checksScanResult(), ingested);

    expect(resolved.observations).toHaveLength(0);
    expect(resolved.auditRows).toEqual([expect.objectContaining({ matchStatus: "unmatched" })]);
  });
});
