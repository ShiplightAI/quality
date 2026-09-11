import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCTION_POLICY,
  assessBehavior,
  collectWorkflowEvidence,
  evaluateReleasePolicy,
  type ExpectedBehavior,
  type ReleaseWorkflowEvidence,
  type RepositoryFacts,
} from "@shiplightai/quality-core/release-intelligence";
import { observationSelectionForProfile } from "@shiplightai/quality-core/release-intelligence/operations";

describe("release intelligence public contract", () => {
  it("derives a deterministic release decision from provider-neutral facts", () => {
    const behavior: ExpectedBehavior = {
      id: "checkout:success",
      featureId: "checkout",
      title: "Checkout succeeds",
      priority: "P0",
      origin: "explicit",
      reviewStatus: "confirmed",
      sourceRefs: [{ path: "specs/checkout.md" }],
      requiredProof: ["Checkout succeeds at runtime"],
      applicable: true,
    };
    const facts: RepositoryFacts = {
      features: [
        {
          key: "checkout",
          name: "Checkout",
          description: "",
          priority: "P0",
          status: "confirmed",
          sourceRefs: [],
          diagnostics: [],
          behaviors: [
            {
              key: behavior.id,
              title: behavior.title,
              priority: behavior.priority,
              origin: behavior.origin,
              reviewStatus: "confirmed",
              sourceRefs: behavior.sourceRefs,
              requiredProof: behavior.requiredProof,
              evidenceDeclarations: [
                { key: "contract", kind: "contract", sourceName: "Checkout contract" },
              ],
            },
          ],
        },
      ],
      runtimeEvidence: [
        {
          key: "observation:contract:1",
          evidenceKey: "contract",
          behaviorKey: behavior.id,
          kind: "contract",
          sourceName: "Checkout contract",
          runtimeStatus: "passed",
          identityStatus: "matched",
          collectionStatus: "available",
          proves: behavior.requiredProof,
          reason: "The exact-run observation passed.",
        },
      ],
      diagnostics: [],
      integrityDiagnostics: [],
      factIntegrity: "complete",
      factSet: {},
    };
    const workflow: ReleaseWorkflowEvidence = {
      runId: "42",
      conclusion: "success",
      jobs: [],
      artifacts: [],
    };

    const evidence = collectWorkflowEvidence(workflow, facts);
    const assessment = assessBehavior(
      behavior,
      evidence.map((item) => ({
        id: item.key,
        runtimeStatus: item.runtimeStatus,
        identityStatus: item.identityStatus,
        collectionStatus: item.collectionStatus,
        relationship: item.relationship,
        proves: item.proves,
      })),
    );
    const result = evaluateReleasePolicy({
      policy: DEFAULT_PRODUCTION_POLICY,
      assessments: [assessment],
      now: new Date("2026-09-09T00:00:00.000Z"),
    });

    expect(assessment.status).toBe("verified");
    expect(result.decision).toBe("ALLOW");
  });

  it("does not import Shipyard platform infrastructure", () => {
    const directory = resolve("packages/core/src/release-intelligence");
    const source = readdirSync(directory)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(resolve(directory, file), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/@shipyard\//u);
    expect(source).not.toMatch(/drizzle-orm|bullmq|next-auth/u);
    expect(source).not.toMatch(/node:(?:fs|child_process)/u);
  });

  it("publishes fact compilation through a separate server operation entry", () => {
    expect(
      observationSelectionForProfile({
        profileId: "release",
        profileWorkflow: "release.yml",
        analyzedWorkflowPath: ".github/workflows/release.yml",
        workflowRunId: "42",
        commitSha: "a".repeat(40),
      }),
    ).toMatchObject({
      commit: "a".repeat(40),
      profiles: [{ profileId: "release", runId: 42 }],
    });
  });
});
