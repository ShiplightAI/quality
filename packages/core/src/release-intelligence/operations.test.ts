import { describe, expect, it } from "vitest";
import {
  diagnosticsForSelectedQualityMaps,
  isUsableSelectedQualityMap,
  observationProfileTargetsRepository,
  observationSelectionForProfile,
  redactDiagnosticSecrets,
} from "./operations";

describe("release fact compilation helpers", () => {
  it("retains diagnostics that make a selected quality map partial", () => {
    const diagnostic = {
      severity: "warning",
      code: "UNKNOWN_FIELD",
      message: "Unknown quality-map field is ignored.",
      mapPath: ".quality/evidence/web/quality-map.yaml",
    };

    expect(
      diagnosticsForSelectedQualityMaps([{ diagnostics: [diagnostic] }, { diagnostics: [] }]),
    ).toEqual([diagnostic]);
  });

  it("requires a usable graph for valid and partial quality maps", () => {
    expect(isUsableSelectedQualityMap({ status: "valid", graph: {} })).toBe(true);
    expect(isUsableSelectedQualityMap({ status: "partial", graph: {} })).toBe(true);
    expect(isUsableSelectedQualityMap({ status: "partial" })).toBe(false);
    expect(isUsableSelectedQualityMap({ status: "invalid", graph: {} })).toBe(false);
  });

  it("matches only the release repository using case-insensitive GitHub coordinates", () => {
    expect(
      observationProfileTargetsRepository("ShiplightAI/shipyard", "shiplightai/SHIPYARD"),
    ).toBe(true);
    expect(
      observationProfileTargetsRepository("ShiplightAI/private", "ShiplightAI/shipyard"),
    ).toBe(false);
    expect(observationProfileTargetsRepository("invalid", "ShiplightAI/shipyard")).toBe(false);
    expect(
      observationProfileTargetsRepository("ShiplightAI/shipyard/extra", "ShiplightAI/shipyard"),
    ).toBe(false);
  });

  it("pins the analyzed workflow profile to its immutable run", () => {
    const commitSha = "58a543249c8035979b06e6de564fd496b606aed3";

    expect(
      observationSelectionForProfile({
        profileId: "release-apps-to-staging",
        profileWorkflow: "release-apps-to-staging.yml",
        analyzedWorkflowPath: ".github/workflows/release-apps-to-staging.yml",
        workflowRunId: "32042052300",
        commitSha,
      }),
    ).toEqual({
      commit: commitSha,
      profiles: [
        {
          profileId: "release-apps-to-staging",
          runId: 32042052300,
          commit: commitSha,
        },
      ],
    });
    expect(
      observationSelectionForProfile({
        profileId: "ci-quality-evidence",
        profileWorkflow: "ci.yml",
        analyzedWorkflowPath: ".github/workflows/release-apps-to-staging.yml",
        workflowRunId: "32042052300",
        commitSha,
      }),
    ).toEqual({ commit: commitSha });
  });

  it("redacts injected and provider-shaped secrets without mutating diagnostics", () => {
    const token = "github_pat_abcdefghijklmnopqrstuvwxyz123456";
    const diagnostics = [
      {
        message: `Request failed with secret-token and ${token}`,
        context: { authorization: "Bearer secret-token" },
      },
    ];

    expect(redactDiagnosticSecrets(diagnostics, ["secret-token"])).toEqual([
      {
        message: "Request failed with [REDACTED] and [REDACTED]",
        context: { authorization: "Bearer [REDACTED]" },
      },
    ]);
    expect(diagnostics[0]?.message).toContain("secret-token");
  });
});
