import { describe, expect, it } from "vitest";
import {
  acceptRiskInstruction,
  addCheckInstruction,
  approveCheckListInstruction,
  removeCheckInstruction,
  removeObservationSetInstruction,
  removeObservationSourceInstruction,
  removeViewInstruction,
  setProofPolicyInstruction,
  unacceptRiskInstruction
} from "./instructions";

// The read-only QC UI authors nothing; each former edit becomes a copy-to-agent instruction.
// These builders must name the `quality` skill, the exact target (feature/check/category/value),
// and the .quality edit — enough for a coding agent to act and open a PR — so assert those anchors.

describe("copy-to-agent instructions", () => {
  const base = { feature: "046-analytics-api", checkTitle: "Rankings scoped to org", checkId: "rankings-scoped" };

  it("acceptRisk names the category, check, feature, accepted_gaps, and the human-decision gate", () => {
    const out = acceptRiskInstruction({ ...base, category: "weak" });
    expect(out).toContain("`quality` skill");
    expect(out).toContain('"weak"');
    expect(out).toContain(base.checkId);
    expect(out).toContain(base.feature);
    expect(out).toContain("accepted_gaps");
    expect(out).toMatch(/human decision|accepted the risk/i);
  });

  it("unacceptRisk removes the category from accepted_gaps", () => {
    const out = unacceptRiskInstruction({ ...base, category: "stale" });
    expect(out).toContain("un-accept");
    expect(out).toContain('"stale"');
    expect(out).toMatch(/remove .*accepted_gaps/i);
  });

  it("setProofPolicy carries the require_gate boolean", () => {
    expect(setProofPolicyInstruction({ ...base, requireGate: true })).toContain("require_gate: true");
    expect(setProofPolicyInstruction({ ...base, requireGate: false })).toContain("require_gate: false");
  });

  it("addCheck carries title, priority, and an honest provenance", () => {
    const out = addCheckInstruction({ feature: base.feature, title: "Empty result on no data", priority: "P1" });
    expect(out).toContain("Empty result on no data");
    expect(out).toContain("P1");
    expect(out).toContain("structure_provenance");
    expect(out).toContain("user_authored");
  });

  it("removeCheck names the check to delete", () => {
    const out = removeCheckInstruction(base);
    expect(out).toContain(base.checkId);
    expect(out).toMatch(/remove|delete/i);
  });

  it("approveCheckList sets checks_reviewed and gates it on human review", () => {
    const out = approveCheckListInstruction({ feature: base.feature });
    expect(out).toContain("checks_reviewed: true");
    expect(out).toMatch(/reviewed and approved/i);
  });

  it("removeObservationSource names the source and drops set references", () => {
    const out = removeObservationSourceInstruction({ name: "CLI publish", id: "cli-publish" });
    expect(out).toContain("cli-publish");
    expect(out).toContain(".quality/config/observation-sources.yaml");
    expect(out).toContain(".quality/config/observation-sets.yaml");
  });

  it("removeObservationSet names the set to delete", () => {
    const out = removeObservationSetInstruction({ name: "Release gate", id: "set-1" });
    expect(out).toContain("set-1");
    expect(out).toContain(".quality/config/observation-sets.yaml");
    expect(out).toMatch(/remove/i);
  });

  it("removeView names the view to delete", () => {
    const out = removeViewInstruction({ name: "MVP surface", id: "view-1" });
    expect(out).toContain("view-1");
    expect(out).toContain(".quality/config/views.yaml");
    expect(out).toMatch(/remove/i);
  });
});
