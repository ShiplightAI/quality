import { generateFixPrompts, type FixPromptRecord } from "@shiplightai/quality-core";
import { describe, expect, it } from "vitest";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

// fix-prompts is now driven by the same structural assessment the scores use
// (deriveExpectationAssessment), not the legacy embedded `evaluation` block.
// This map exercises the four load-bearing outcomes: a fully-proven check (no
// prompt), a single-modality MEDIUM check (confidence upgrade), a manual-only
// check (needs automated proof), and a check with a declared proof gap.
function assessmentQualityMap(): string {
  return `structure_provenance: "user_authored"
target:
  id: "feature-assess"
  name: "Feature Assess"
  scope: "feature"
expectations:
  - id: "covered-high"
    title: "Fully proven in CI"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    evidence:
      - id: "covered-high-source"
        type: "unit"
        path: "apps/x/src/covered.test.ts"
        contexts:
          - "pr-ci"
  - id: "medium-single"
    title: "Single non-gated automated proof"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    evidence:
      - id: "medium-single-source"
        type: "unit"
        path: "apps/x/src/medium.test.ts"
        contexts:
          - "local"
  - id: "manual-only"
    title: "Only a manual check"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    evidence:
      - id: "manual-only-source"
        type: "manual"
        path: "docs/manual-check.md"
        contexts:
          - "local"
  - id: "with-proof-gap"
    title: "Gated proof but a declared gap"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P0"
    proof_gap:
      summary: "The live assertion path self-skips in CI without a key."
    evidence:
      - id: "with-proof-gap-source"
        type: "unit"
        path: "apps/x/src/gap.test.ts"
        contexts:
          - "pr-ci"
`;
}

async function recordsFor(includeCovered: boolean): Promise<readonly FixPromptRecord[]> {
  const fixture = await createFixtureProject(
    `fix-prompts-assessment-${includeCovered ? "all" : "gaps"}`,
    [
      {
        relativePath: ".quality/evidence/feature-assess/quality-map.yaml",
        contents: assessmentQualityMap()
      }
    ]
  );
  try {
    return generateFixPrompts({ repo: fixture.root, format: "json", includeCovered }).records;
  } finally {
    await fixture.cleanup();
  }
}

describe("fix-prompts assessment-driven flagging", () => {
  it("flags only checks below target by default (not fully-proven ones)", async () => {
    const records = await recordsFor(false);
    const ids = records.map((record) => record.expectation_id).sort();

    // covered-high is COVERED at HIGH confidence (gated automated) → not flagged.
    expect(ids).toEqual(["manual-only", "medium-single", "with-proof-gap"]);
  });

  it("includes every check under --include-covered", async () => {
    const records = await recordsFor(true);
    expect(records.map((record) => record.expectation_id).sort()).toEqual([
      "covered-high",
      "manual-only",
      "medium-single",
      "with-proof-gap"
    ]);
  });

  it("names the specific evidence-confidence lever per gap", async () => {
    const records = await recordsFor(false);
    const byId = new Map(records.map((record) => [record.expectation_id, record]));

    // Single non-gated automated modality → raise to HIGH.
    const medium = byId.get("medium-single");
    expect(medium?.closure_mode).toBe("confidence_upgrade");
    expect(medium?.recommended_action).toContain("gated (pr-ci)");

    // Manual only → add automated proof.
    expect(byId.get("manual-only")?.closure_mode).toBe("no_automated_proof");

    // Declared proof gap → surface the gap text.
    const gap = byId.get("with-proof-gap");
    expect(gap?.closure_mode).toBe("proof_gap");
    expect(gap?.problem).toContain("self-skips in CI");
  });
});
