import { describe, expect, it } from "vitest";
import type {
  NormalizedEvidenceEntry,
  NormalizedExpectation,
  NormalizedQualityGraph
} from "../../packages/quality-map/src/types";
import {
  deriveExpectationAssessment,
  isAutomatedType,
  isGateContext,
  proofTier
} from "../../packages/core/src/quality-structure/assessment";

const SOURCE_ATTRIBUTION = {
  sourceClassification: "structured_quality_map",
  mapPath: "quality-map.yaml",
  yamlPath: "$"
} as const;

function makeEvidence(
  localId: string,
  type: string,
  contexts: readonly string[] = []
): NormalizedEvidenceEntry {
  return {
    normalizedId: `evidence:${localId}`,
    localId,
    sourceAttribution: SOURCE_ATTRIBUTION,
    type,
    contexts,
    expectationId: "expectation:exp"
  };
}

function makeExpectation(linkedEvidenceIds: readonly string[]): NormalizedExpectation {
  return {
    normalizedId: "expectation:exp",
    localId: "exp",
    sourceAttribution: SOURCE_ATTRIBUTION,
    title: "Expectation",
    structureProvenance: "user_authored",
    linkedTaskIds: [],
    linkedEvidenceIds,
    residualRiskIds: [],
    acceptedGaps: []
  };
}

function makeGraph(
  expectation: NormalizedExpectation,
  evidence: readonly NormalizedEvidenceEntry[]
): NormalizedQualityGraph {
  return {
    source: {
      projectRelativePath: "quality-map.yaml",
      resolvedLocalPath: "/repo/quality-map.yaml"
    },
    target: {
      normalizedId: "target:t",
      localId: "t",
      sourceAttribution: SOURCE_ATTRIBUTION,
      name: "Target",
      aliases: []
    },
    sourceRefs: [],
    expectations: [expectation],
    tasks: [],
    evidence,
    residualRisks: [],
    checksReviewed: false
  };
}

function assess(evidence: readonly NormalizedEvidenceEntry[]): { status: string; evidenceConfidence: string } {
  const expectation = makeExpectation(evidence.map((entry) => entry.normalizedId));
  const graph = makeGraph(expectation, evidence);
  const assessment = deriveExpectationAssessment(graph, expectation);
  return { status: assessment.status, evidenceConfidence: assessment.evidenceConfidence };
}

describe("proofTier", () => {
  it("classifies automated evidence types as automated", () => {
    expect(proofTier("unit")).toBe("automated");
    expect(proofTier("contract")).toBe("automated");
    expect(proofTier("integration")).toBe("automated");
    expect(proofTier("e2e")).toBe("automated");
    expect(proofTier("agent")).toBe("automated");
  });

  it("classifies manual evidence as manual", () => {
    expect(proofTier("manual")).toBe("manual");
  });

  it("classifies other evidence types as supporting", () => {
    expect(proofTier("static")).toBe("supporting");
    expect(proofTier("smoke")).toBe("supporting");
    expect(proofTier("telemetry")).toBe("supporting");
    expect(proofTier("none")).toBe("supporting");
  });
});

describe("isAutomatedType", () => {
  it("is true for the automated evidence types", () => {
    expect(isAutomatedType("unit")).toBe(true);
    expect(isAutomatedType("contract")).toBe(true);
    expect(isAutomatedType("integration")).toBe(true);
    expect(isAutomatedType("e2e")).toBe(true);
    expect(isAutomatedType("agent")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAutomatedType("UNIT")).toBe(true);
  });

  it("is false for non-automated evidence types", () => {
    expect(isAutomatedType("manual")).toBe(false);
    expect(isAutomatedType("static")).toBe(false);
    expect(isAutomatedType("")).toBe(false);
  });
});

describe("deriveExpectationAssessment", () => {
  it("treats an automated type in a gate context as COVERED with HIGH confidence", () => {
    expect(isGateContext("ci")).toBe(true);
    expect(assess([makeEvidence("unit", "unit", ["ci"])])).toEqual({
      status: "COVERED",
      evidenceConfidence: "HIGH"
    });
  });

  it("treats two distinct ungated automated types as COVERED with HIGH confidence", () => {
    expect(assess([makeEvidence("unit", "unit"), makeEvidence("integration", "integration")])).toEqual({
      status: "COVERED",
      evidenceConfidence: "HIGH"
    });
  });

  it("treats a single ungated automated type as COVERED with MEDIUM confidence", () => {
    expect(assess([makeEvidence("unit", "unit")])).toEqual({
      status: "COVERED",
      evidenceConfidence: "MEDIUM"
    });
  });

  it("treats manual-only evidence as MANUAL with LOW confidence", () => {
    expect(assess([makeEvidence("manual", "manual")])).toEqual({
      status: "MANUAL",
      evidenceConfidence: "LOW"
    });
  });

  it("treats non-automated supporting evidence as IMPLICIT with LOW confidence", () => {
    expect(assess([makeEvidence("smoke", "smoke")])).toEqual({
      status: "IMPLICIT",
      evidenceConfidence: "LOW"
    });
  });

  it("treats no evidence as NOT COVERED with LOW confidence", () => {
    expect(assess([])).toEqual({
      status: "NOT COVERED",
      evidenceConfidence: "LOW"
    });
  });

  // Accepted-risk waiver: an accepted gap must not touch the raw status (so the gap
  // stays visible) but must lift scoreStatus to COVERED (so the accepted risk stops
  // dragging the quality/coverage score). Evidence confidence is never adjusted.
  function assessWithAcceptance(
    evidence: readonly NormalizedEvidenceEntry[],
    acceptedGaps: readonly string[]
  ): { status: string; scoreStatus: string; evidenceConfidence: string } {
    const base = makeExpectation(evidence.map((entry) => entry.normalizedId));
    const expectation: NormalizedExpectation = { ...base, acceptedGaps };
    const assessment = deriveExpectationAssessment(makeGraph(expectation, evidence), expectation);
    return {
      status: assessment.status,
      scoreStatus: assessment.scoreStatus,
      evidenceConfidence: assessment.evidenceConfidence
    };
  }

  it("accepting 'missing' lifts scoreStatus to COVERED while status/confidence stay honest", () => {
    expect(assessWithAcceptance([], ["missing"])).toEqual({
      status: "NOT COVERED",
      scoreStatus: "COVERED",
      evidenceConfidence: "LOW"
    });
  });

  it("accepting 'manual-only' lifts scoreStatus for manual-only evidence", () => {
    expect(assessWithAcceptance([makeEvidence("manual", "manual")], ["manual-only"])).toEqual({
      status: "MANUAL",
      scoreStatus: "COVERED",
      evidenceConfidence: "LOW"
    });
  });

  it("accepting 'weak' lifts scoreStatus for weak (implicit) evidence", () => {
    expect(assessWithAcceptance([makeEvidence("smoke", "smoke")], ["weak"])).toEqual({
      status: "IMPLICIT",
      scoreStatus: "COVERED",
      evidenceConfidence: "LOW"
    });
  });

  it("a non-matching acceptance does not lift scoreStatus", () => {
    // The check's penalty category is "missing" (no evidence); accepting "weak" is a no-op.
    expect(assessWithAcceptance([], ["weak"])).toMatchObject({
      status: "NOT COVERED",
      scoreStatus: "NOT COVERED"
    });
  });

  it("scoreStatus equals status when nothing is accepted", () => {
    const result = assessWithAcceptance([makeEvidence("manual", "manual")], []);
    expect(result.scoreStatus).toBe(result.status);
  });
});
