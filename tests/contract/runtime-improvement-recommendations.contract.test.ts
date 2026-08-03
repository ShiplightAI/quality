import { describe, expect, it } from "vitest";
import {
  buildRuntimeImprovementRecommendations,
  type ScanResult,
  type TargetEvaluationSnapshot
} from "@shiplightai/quality-core";

function makeResult(): ScanResult {
  return {
    qualityMaps: {
      results: [
        {
          source: {
            projectRelativePath: ".quality/evidence/engine/quality-map.yaml"
          },
          graph: {
            source: {
              projectRelativePath: ".quality/evidence/engine/quality-map.yaml"
            },
            target: {
              normalizedId: "target-engine",
              localId: "001-engine",
              name: "Shared Engine"
            },
            expectations: [
              {
                normalizedId: "exp-engine-critical",
                localId: "engine-critical",
                title: "Critical engine flow passes runtime verification",
                priority: "P0",
                linkedEvidenceIds: ["ev-engine-critical"],
                residualRiskIds: []
              },
              {
                normalizedId: "exp-engine-partial",
                localId: "engine-partial",
                title: "Shared engine smoke coverage completes",
                priority: "P2",
                linkedEvidenceIds: ["ev-engine-pass", "ev-engine-missing"],
                residualRiskIds: []
              }
            ],
            evidence: [
              {
                normalizedId: "ev-engine-critical",
                localId: "engine-critical-proof",
                expectationId: "exp-engine-critical",
                type: "e2e",
                path: "packages/sdk-core/tests/specs/engine-fixture.spec.ts",
                command: "pnpm --filter sdk-core test:browser",
                contexts: []
              },
              {
                normalizedId: "ev-engine-pass",
                localId: "engine-pass-proof",
                expectationId: "exp-engine-partial",
                type: "e2e",
                path: "packages/sdk-core/tests/specs/engine-pass.spec.ts",
                command: "pnpm --filter sdk-core test:browser",
                contexts: []
              },
              {
                normalizedId: "ev-engine-missing",
                localId: "engine-missing-proof",
                expectationId: "exp-engine-partial",
                type: "e2e",
                path: "packages/sdk-core/tests/specs/engine-missing.spec.ts",
                command: "pnpm --filter sdk-core test:browser",
                contexts: []
              }
            ],
            residualRisks: [],
            sourceRefs: [],
            tasks: [],
            checksReviewed: false
          }
        },
        {
          source: {
            projectRelativePath: ".quality/evidence/cli/quality-map.yaml"
          },
          graph: {
            source: {
              projectRelativePath: ".quality/evidence/cli/quality-map.yaml"
            },
            target: {
              normalizedId: "target-cli",
              localId: "002-cli",
              name: "Shiplight CLI"
            },
            expectations: [
              {
                normalizedId: "exp-cli-release",
                localId: "cli-release",
                title: "CLI release workflow passes runtime verification",
                priority: "P1",
                linkedEvidenceIds: ["ev-cli-release"],
                residualRiskIds: [],
                proofGapNextStep: "Repair the release workflow and artifact assertions."
              }
            ],
            evidence: [
              {
                normalizedId: "ev-cli-release",
                localId: "cli-release-proof",
                expectationId: "exp-cli-release",
                type: "e2e",
                path: "apps/cli/tests/release.spec.ts",
                command: "pnpm --filter shiplightai test:e2e",
                contexts: []
              }
            ],
            residualRisks: [],
            sourceRefs: [],
            tasks: [],
            checksReviewed: false
          }
        }
      ]
    }
  } as unknown as ScanResult;
}

function makeTargets(): readonly TargetEvaluationSnapshot[] {
  return [
    {
      state: "available",
      targetId: "target-engine",
      targetLocalId: "001-engine",
      displayName: "Shared Engine",
      evaluatedAt: "2026-06-09T00:00:00.000Z",
      observedState: "partial",
      counts: {
        pass: 0,
        fail: 0,
        error: 0,
        skipped: 0,
        partial: 1,
        unobserved: 1
      },
      diagnostics: [],
      expectations: [
        {
          expectationId: "exp-engine-critical",
          expectationLocalId: "engine-critical",
          title: "Critical engine flow passes runtime verification",
          structuralStatus: "COVERED",
          evidenceConfidence: "HIGH",
          structureConfidence: "HIGH",
          structureProvenance: "spec",
          observedState: "unobserved",
          evidence: [
            {
              evidenceId: "ev-engine-critical",
              evidenceLocalId: "engine-critical-proof",
              state: "unobserved"
            }
          ]
        },
        {
          expectationId: "exp-engine-partial",
          expectationLocalId: "engine-partial",
          title: "Shared engine smoke coverage completes",
          structuralStatus: "COVERED",
          evidenceConfidence: "HIGH",
          structureConfidence: "HIGH",
          structureProvenance: "spec",
          observedState: "partial",
          evidence: [
            {
              evidenceId: "ev-engine-pass",
              evidenceLocalId: "engine-pass-proof",
              state: "pass"
            },
            {
              evidenceId: "ev-engine-missing",
              evidenceLocalId: "engine-missing-proof",
              state: "unobserved"
            }
          ]
        }
      ]
    },
    {
      state: "available",
      targetId: "target-cli",
      targetLocalId: "002-cli",
      displayName: "Shiplight CLI",
      evaluatedAt: "2026-06-09T00:00:00.000Z",
      observedState: "fail",
      counts: {
        pass: 0,
        fail: 1,
        error: 0,
        skipped: 0,
        partial: 0,
        unobserved: 0
      },
      diagnostics: [],
      expectations: [
        {
          expectationId: "exp-cli-release",
          expectationLocalId: "cli-release",
          title: "CLI release workflow passes runtime verification",
          structuralStatus: "COVERED",
          evidenceConfidence: "MEDIUM",
          structureConfidence: "MEDIUM",
          structureProvenance: "spec",
          observedState: "fail",
          evidence: [
            {
              evidenceId: "ev-cli-release",
              evidenceLocalId: "cli-release-proof",
              state: "fail"
            }
          ]
        }
      ]
    }
  ];
}

describe("runtime improvement recommendations", () => {
  it("ranks open evaluated expectations by projected score lift", () => {
    const recommendations = buildRuntimeImprovementRecommendations({
      result: makeResult(),
      targets: makeTargets(),
      limit: 3
    });

    expect(recommendations.map((recommendation) => recommendation.expectationLocalId)).toEqual([
      "engine-critical",
      "cli-release",
      "engine-partial"
    ]);
    expect(recommendations[0]).toMatchObject({
      targetName: "Shared Engine",
      qualityMapPath: ".quality/evidence/engine/quality-map.yaml",
      observedState: "unobserved",
      potentialLift: 50,
      currentScore: 14,
      projectedScore: 64
    });
    expect(recommendations[1]).toMatchObject({
      targetName: "Shiplight CLI",
      observedState: "fail",
      potentialLift: 30,
      projectedScore: 44
    });
    expect(recommendations[2]).toMatchObject({
      observedState: "partial",
      potentialLift: 6,
      proofSourcePaths: ["packages/sdk-core/tests/specs/engine-missing.spec.ts"]
    });
  });

  it("returns no recommendations when every evaluated expectation already passes", () => {
    const recommendations = buildRuntimeImprovementRecommendations({
      result: makeResult(),
      targets: [{
        ...makeTargets()[0]!,
        expectations: [{
          expectationId: "exp-engine-critical",
          expectationLocalId: "engine-critical",
          title: "Critical engine flow passes runtime verification",
          structuralStatus: "COVERED",
          evidenceConfidence: "HIGH",
          structureConfidence: "HIGH",
          structureProvenance: "spec",
          observedState: "pass",
          evidence: [{
            evidenceId: "ev-engine-critical",
            evidenceLocalId: "engine-critical-proof",
            state: "pass"
          }]
        }],
        counts: {
          pass: 1,
          fail: 0,
          error: 0,
          skipped: 0,
          partial: 0,
          unobserved: 0
        },
        observedState: "pass"
      }]
    });

    expect(recommendations).toEqual([]);
  });
});
