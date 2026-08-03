import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { applyQualityMapEdits } from "../../packages/core/src/quality-map-edit/apply-edits";

const RAW = [
  "# quality map",
  'structure_provenance: "agent_generated"',
  "target:",
  '  id: "001-alpha"',
  "expectations:",
  '  - id: "exp-1"',
  '    title: "A"',
  '    priority: "P1"',
  '  - id: "exp-2"',
  '    title: "B"',
  "    policy_override:",
  "      notes: keep me",
  ""
].join("\n");

function parsed(text: string): {
  structure_provenance?: string;
  checks_reviewed?: boolean;
  expectations: Array<Record<string, unknown>>;
} {
  return parseDocument(text).toJSON() as {
    structure_provenance?: string;
    checks_reviewed?: boolean;
    expectations: Array<Record<string, unknown>>;
  };
}

describe("applyQualityMapEdits", () => {
  it("approves the check list by setting checks_reviewed, leaving origins untouched (gate 4)", () => {
    const result = applyQualityMapEdits(RAW, { reviewCheckList: true });

    expect(result.updated).toContain("map");
    expect(result.text).toContain("# quality map"); // comment preserved
    expect(parsed(result.text).checks_reviewed).toBe(true);
    // Origin is never overwritten by review.
    expect(parsed(result.text).structure_provenance).toBe("agent_generated");
  });

  it("sets proof policy on a check, creating policy_override when absent (gate 5)", () => {
    const result = applyQualityMapEdits(RAW, {
      policyEdits: [{ id: "exp-1", requireGate: true }]
    });

    const exp1 = parsed(result.text).expectations[0]!;
    expect(exp1).toMatchObject({ id: "exp-1", policy_override: { require_gate: true } });
  });

  it("accepts a gap on a check, maintaining the accepted_gaps list", () => {
    const result = applyQualityMapEdits(RAW, {
      gapAcceptanceEdits: [
        { id: "exp-1", category: "weak", accepted: true },
        { id: "exp-1", category: "manual-only", accepted: true }
      ]
    });

    const exp1 = parsed(result.text).expectations[0]!;
    expect(exp1.accepted_gaps).toEqual(["weak", "manual-only"]);
    expect(result.updated).toContain("exp-1");
  });

  it("un-accepts a gap, dropping accepted_gaps entirely when the last one is removed", () => {
    const accepted = applyQualityMapEdits(RAW, {
      gapAcceptanceEdits: [{ id: "exp-1", category: "weak", accepted: true }]
    });
    const cleared = applyQualityMapEdits(accepted.text, {
      gapAcceptanceEdits: [{ id: "exp-1", category: "weak", accepted: false }]
    });

    expect(parsed(cleared.text).expectations[0]!.accepted_gaps).toBeUndefined();
  });

  it("reports an unknown id for a gap acceptance edit without applying it", () => {
    const result = applyQualityMapEdits(RAW, {
      gapAcceptanceEdits: [{ id: "nope", category: "weak", accepted: true }]
    });

    expect(result.unknownIds).toEqual(["nope"]);
    expect(result.updated).toEqual([]);
  });

  it("merges into an existing policy_override without dropping other fields", () => {
    const result = applyQualityMapEdits(RAW, { policyEdits: [{ id: "exp-2", requireGate: true }] });

    const exp2 = parsed(result.text).expectations[1]!;
    expect(exp2.policy_override).toMatchObject({ notes: "keep me", require_gate: true });
  });

  it("reports unknown expectation ids without applying them", () => {
    const result = applyQualityMapEdits(RAW, { policyEdits: [{ id: "nope", requireGate: true }] });

    expect(result.unknownIds).toEqual(["nope"]);
    expect(result.updated).toEqual([]);
  });

  it("appends a human-authored check (gate 4 curation)", () => {
    const result = applyQualityMapEdits(RAW, {
      addExpectations: [{ id: "exp-3", title: "Handles concurrent sessions", priority: "P0" }]
    });

    const expectations = parsed(result.text).expectations;
    expect(expectations).toHaveLength(3);
    // A human-added check is stamped user_authored, not left to inherit the map default.
    expect(expectations[2]).toMatchObject({
      id: "exp-3",
      title: "Handles concurrent sessions",
      priority: "P0",
      structure_provenance: "user_authored"
    });
    expect(result.updated).toContain("exp-3");
  });

  it("removes a check by id and reports an unknown removal", () => {
    const result = applyQualityMapEdits(RAW, { removeExpectationIds: ["exp-1", "ghost"] });

    const ids = parsed(result.text).expectations.map((expectation) => expectation.id);
    expect(ids).toEqual(["exp-2"]);
    expect(result.updated).toContain("exp-1");
    expect(result.unknownIds).toEqual(["ghost"]);
  });

  it("removes a check and reports a policy edit for that same id as unknown (remove runs first)", () => {
    const result = applyQualityMapEdits(RAW, {
      removeExpectationIds: ["exp-1"],
      policyEdits: [{ id: "exp-1", requireGate: true }]
    });

    expect(parsed(result.text).expectations.map((expectation) => expectation.id)).toEqual(["exp-2"]);
    expect(result.updated).toContain("exp-1"); // the removal
    expect(result.unknownIds).toContain("exp-1"); // the now-gone policy target
  });

  it("skips a duplicate addition id within one batch instead of writing a duplicate", () => {
    const result = applyQualityMapEdits(RAW, {
      addExpectations: [
        { id: "exp-3", title: "First", priority: "P1" },
        { id: "exp-3", title: "Dup", priority: "P2" }
      ]
    });

    const exp3 = parsed(result.text).expectations.filter((expectation) => expectation.id === "exp-3");
    expect(exp3).toHaveLength(1);
    expect(result.unknownIds).toContain("exp-3");
  });

  it("skips an addition whose id already exists in the map and reports it", () => {
    const result = applyQualityMapEdits(RAW, {
      addExpectations: [{ id: "exp-1", title: "Collides with existing", priority: "P1" }]
    });

    expect(parsed(result.text).expectations.filter((expectation) => expectation.id === "exp-1")).toHaveLength(1);
    expect(result.unknownIds).toContain("exp-1");
  });

  it("creates the expectations list when adding to a map that has none", () => {
    const empty = ['structure_provenance: "agent_generated"', "target:", '  id: "001-alpha"', ""].join("\n");
    const result = applyQualityMapEdits(empty, {
      addExpectations: [{ id: "exp-1", title: "First check", priority: "P1" }]
    });

    expect(parsed(result.text).expectations).toHaveLength(1);
    expect(parsed(result.text).expectations[0]).toMatchObject({ id: "exp-1", title: "First check" });
  });
});
