import { describe, expect, it } from "vitest";
import {
  isFeatureConfirmed,
  structureLevel,
  structurePoints
} from "../../packages/core/src/quality-structure/assessment";

describe("structurePoints / structureLevel (review override)", () => {
  it("lifts any origin to HIGH (1.0) once reviewed — human opinion first", () => {
    for (const origin of ["spec", "user_authored", "agent_generated", "inferred_brownfield", "unspecified"] as const) {
      expect(structurePoints(origin, true)).toBe(1);
      expect(structureLevel(origin, true)).toBe("HIGH");
    }
  });

  it("falls back to the origin table when unreviewed", () => {
    expect(structurePoints("spec", false)).toBe(1);
    expect(structurePoints("agent_generated", false)).toBe(0.7);
    expect(structurePoints("inferred_brownfield", false)).toBe(0.4);
    expect(structurePoints("unspecified", false)).toBe(0);

    expect(structureLevel("agent_generated", false)).toBe("MEDIUM");
    expect(structureLevel("inferred_brownfield", false)).toBe("LOW");
    expect(structureLevel("unspecified", false)).toBe("UNSPECIFIED");
  });
});

describe("isFeatureConfirmed (gate 2)", () => {
  it("treats a candidate feature as unconfirmed and everything else as confirmed", () => {
    expect(isFeatureConfirmed("candidate")).toBe(false);
    expect(isFeatureConfirmed("active")).toBe(true);
    // No matching project-map feature → no candidate gate to clear → confirmed.
    expect(isFeatureConfirmed(undefined)).toBe(true);
  });
});
