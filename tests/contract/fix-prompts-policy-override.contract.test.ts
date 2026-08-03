import { generateFixPrompts, type FixPromptRecord } from "@shiplightai/quality-core";
import { describe, expect, it } from "vitest";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

// The policy-override-driven gap modes (needs_gate, required_modality,
// required_context) are mapping arms in primaryGapMode / recommendedAction /
// closureCondition. Each expectation below is shaped so exactly ONE policy reason
// fires, isolating the mode-priority order in primaryGapMode. (The former
// `require_multi_layer` / `needs_multi_layer` mode was retired — a raw count of
// test layers is a weak proxy for proof strength.)
function policyQualityMap(): string {
  return `structure_provenance: "user_authored"
target:
  id: "feature-policy"
  name: "Feature Policy"
  scope: "feature"
expectations:
  - id: "needs-gate"
    title: "Automated but not gated"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    policy_override:
      require_gate: true
    evidence:
      - id: "needs-gate-source"
        type: "unit"
        path: "apps/x/src/needs-gate.test.ts"
        contexts:
          - "local"
  - id: "required-modality"
    title: "Required modality absent"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    policy_override:
      required_modalities:
        - "e2e"
    evidence:
      - id: "required-modality-source"
        type: "unit"
        path: "apps/x/src/required-modality.test.ts"
        contexts:
          - "pr-ci"
  - id: "required-context"
    title: "Required context absent"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    policy_override:
      required_contexts:
        - "pr-ci"
    evidence:
      - id: "required-context-source"
        type: "unit"
        path: "apps/x/src/required-context.test.ts"
        contexts:
          - "local"
`;
}

async function records(): Promise<Map<string, FixPromptRecord>> {
  const fixture = await createFixtureProject("fix-prompts-policy-override", [
    {
      relativePath: ".quality/evidence/feature-policy/quality-map.yaml",
      contents: policyQualityMap()
    }
  ]);
  try {
    const result = generateFixPrompts({ repo: fixture.root, format: "json", includeCovered: false });
    return new Map(result.records.map((record) => [record.expectation_id, record]));
  } finally {
    await fixture.cleanup();
  }
}

describe("fix-prompts policy-override gap modes", () => {
  it("maps require_gate to needs_gate with a gating action", async () => {
    const record = (await records()).get("needs-gate");
    expect(record?.closure_mode).toBe("needs_gate");
    expect(record?.recommended_action).toContain("gated context (pr-ci / CI)");
    expect(record?.closure_condition).toContain("gated (pr-ci) context");
    expect(record?.non_closing_changes).toContain(
      "Running the proof only locally without wiring it into the pr-ci gate."
    );
  });

  it("maps required_modalities to required_modality and names the modality", async () => {
    const record = (await records()).get("required-modality");
    expect(record?.closure_mode).toBe("required_modality");
    expect(record?.recommended_action).toContain("e2e");
    expect(record?.non_closing_changes).toContain(
      "Adding another test in an already-covered modality while the required modality is still absent."
    );
  });

  it("maps required_contexts to required_context and names the context", async () => {
    const record = (await records()).get("required-context");
    expect(record?.closure_mode).toBe("required_context");
    expect(record?.recommended_action).toContain("pr-ci");
    expect(record?.non_closing_changes).toContain(
      "Running the proof only in the current context instead of adding a run in the required context."
    );
  });
});
