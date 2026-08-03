import type {
  NormalizedEvidenceEntry,
  NormalizedExpectation,
  NormalizedQualityGraph,
  StructureProvenance
} from "@shiplightai/quality-map";

export type StructureConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "UNSPECIFIED";

// Structure confidence is an axis orthogonal to evidence confidence: it reflects
// how trustworthy the map's *structure* is based on its declared provenance, not
// how strong the proof is. Points and level share one table so the per-check
// label and the rolled-up score can never drift. Structure confidence is the
// human anchor, so a declared check whose provenance is "unspecified" — nobody
// has attested whether it is human- or agent-authored — scores 0 and is COUNTED
// in the denominator, not excluded; stamping its provenance (gate 4) is what
// raises the anchor. The Record key type makes a new provenance value a compile
// error here until it is given a points/level mapping.
const STRUCTURE_PROVENANCE_INFO: Record<
  StructureProvenance,
  { readonly points: number; readonly level: StructureConfidenceLevel }
> = {
  spec: { points: 1, level: "HIGH" },
  user_authored: { points: 1, level: "HIGH" },
  agent_generated: { points: 0.7, level: "MEDIUM" },
  inferred_brownfield: { points: 0.4, level: "LOW" },
  unspecified: { points: 0, level: "UNSPECIFIED" }
};

export function structureConfidencePoints(provenance: StructureProvenance): number {
  return STRUCTURE_PROVENANCE_INFO[provenance].points;
}

/** Undeclared provenance — scores 0 and is the unattested default. */
export function isUnspecifiedProvenance(provenance: StructureProvenance): boolean {
  return provenance === "unspecified";
}

export function structureConfidenceLabel(provenance: StructureProvenance): StructureConfidenceLevel {
  return STRUCTURE_PROVENANCE_INFO[provenance].level;
}

/**
 * Effective structure confidence combines two orthogonal axes: a check's ORIGIN
 * (structure_provenance — never overwritten, shown verbatim as its badge) and
 * HUMAN REVIEW. Human opinion comes first: once a person reviews and approves the
 * check list (gate 4) AND its feature is confirmed (gate 2), every check counts as
 * HIGH regardless of origin — review can confer trust an origin alone never earns.
 * Unreviewed, a check falls back to the trust its origin justifies (the table
 * above). The points and level share that fallback table so they can't drift.
 */
export function structurePoints(provenance: StructureProvenance, reviewed: boolean): number {
  return reviewed ? 1 : structureConfidencePoints(provenance);
}

export function structureLevel(provenance: StructureProvenance, reviewed: boolean): StructureConfidenceLevel {
  return reviewed ? "HIGH" : structureConfidenceLabel(provenance);
}

/**
 * Gate 2: a feature confers structural trust unless it is still an unratified
 * candidate. An absent status (a quality map with no matching project-map feature)
 * counts as confirmed — there is no candidate gate to clear.
 */
export function isFeatureConfirmed(status: string | undefined): boolean {
  return status !== "candidate";
}

export interface StructuralExpectationAssessment {
  readonly status: string;
  /**
   * The status the quality/coverage score should use. Equal to `status` unless a
   * human has accepted this check's blocking gap as tolerated risk (`accepted_gaps`),
   * in which case it rises to COVERED so the accepted risk no longer drags the score
   * down. `status` itself stays raw so the gap is still surfaced (as accepted) in the
   * gap listing. Evidence confidence is never adjusted — acceptance records a decision,
   * it does not manufacture proof.
   */
  readonly scoreStatus: string;
  readonly evidenceConfidence: string;
  readonly structureProvenance: StructureProvenance;
  readonly structureConfidence: StructureConfidenceLevel;
  readonly proofStrength: string;
  readonly hasAnyEvidence: boolean;
  readonly hasAutomatedEvidence: boolean;
  readonly hasStrongDirectEvidence: boolean;
  readonly hasGateEvidence: boolean;
  readonly hasProofGap: boolean;
  readonly missingEvidence: boolean;
  readonly manualOnly: boolean;
  readonly structuralGapReasons: readonly string[];
}

function lower(value: string | undefined | null): string {
  return (value ?? "").toLowerCase();
}

export function isGateContext(context: string): boolean {
  const normalized = context.toLowerCase();
  return (
    normalized.includes("ci") ||
    normalized.includes("gate") ||
    normalized.includes("release") ||
    normalized.includes("staging") ||
    normalized.includes("prod")
  );
}

// Automated, repeatable proof types directly exercise the behavior. Evidence
// confidence is derived from these (plus gate context) — there is no authored
// depth/reliability. Everything outside this set (static, smoke, telemetry,
// script, manual, other) is treated as supporting/weak proof.
const AUTOMATED_EVIDENCE_TYPES = new Set(["unit", "contract", "integration", "e2e", "agent"]);

export function isAutomatedType(type: string): boolean {
  return AUTOMATED_EVIDENCE_TYPES.has(lower(type));
}

// Proof strength tier derived from the evidence type (depth/reliability are gone).
export function proofTier(type: string): string {
  if (isAutomatedType(type)) {
    return "automated";
  }
  return lower(type) === "manual" ? "manual" : "supporting";
}

function isManualEvidence(evidence: NormalizedEvidenceEntry): boolean {
  return lower(evidence.type) === "manual";
}

export function evidenceForExpectation(
  graph: NormalizedQualityGraph,
  expectation: NormalizedExpectation
): readonly NormalizedEvidenceEntry[] {
  return graph.evidence.filter((evidence) => expectation.linkedEvidenceIds.includes(evidence.normalizedId));
}

export function deriveExpectationAssessment(
  graph: NormalizedQualityGraph,
  expectation: NormalizedExpectation
): StructuralExpectationAssessment {
  const evidenceEntries = evidenceForExpectation(graph, expectation);
  const distinctTypes = new Set(evidenceEntries.map((evidence) => lower(evidence.type)).filter(Boolean));
  const automatedTypes = new Set([...distinctTypes].filter((type) => AUTOMATED_EVIDENCE_TYPES.has(type)));
  const hasAnyEvidence = evidenceEntries.length > 0;
  const missingEvidence = evidenceEntries.length === 0;
  const hasAutomatedEvidence = automatedTypes.size > 0;
  const hasGateEvidence = evidenceEntries.some((evidence) => evidence.contexts.some(isGateContext));
  const hasGatedAutomatedEvidence = evidenceEntries.some(
    (evidence) => isAutomatedType(evidence.type) && evidence.contexts.some(isGateContext)
  );
  // HIGH-tier proof: an automated test that runs in a gate context, or
  // defense-in-depth (two or more distinct automated proof types).
  const hasStrongDirectEvidence =
    hasAutomatedEvidence && (hasGatedAutomatedEvidence || automatedTypes.size >= 2);
  const manualOnly = hasAnyEvidence && evidenceEntries.every(isManualEvidence);
  const proofGapText = graph.residualRisks
    .filter((risk) => expectation.residualRiskIds.includes(risk.normalizedId))
    .map((risk) => risk.text)
    .join(" ")
    .trim();
  const hasProofGap = proofGapText.length > 0;

  const structuralGapReasons: string[] = [];
  if (missingEvidence) {
    structuralGapReasons.push("missing");
  }
  if (hasProofGap) {
    structuralGapReasons.push("proof_gap");
  }
  if (expectation.policyOverride?.requireGate === true && !hasGateEvidence) {
    structuralGapReasons.push("needs_gate");
  }
  if (
    expectation.policyOverride !== undefined &&
    expectation.policyOverride.requiredModalities.length > 0 &&
    expectation.policyOverride.requiredModalities.some((modality) => !distinctTypes.has(modality.toLowerCase()))
  ) {
    structuralGapReasons.push("required_modalities");
  }
  if (
    expectation.policyOverride !== undefined &&
    expectation.policyOverride.requiredContexts.length > 0 &&
    expectation.policyOverride.requiredContexts.some(
      (context) => !evidenceEntries.some((evidence) => evidence.contexts.includes(context))
    )
  ) {
    structuralGapReasons.push("required_contexts");
  }
  if (hasAnyEvidence && !hasAutomatedEvidence) {
    structuralGapReasons.push("no_automated");
  }

  const uniqueGapReasons = [...new Set(structuralGapReasons)];

  let status = "PARTIAL";
  let evidenceConfidence = "MEDIUM";
  if (!hasAnyEvidence) {
    status = "NOT COVERED";
    evidenceConfidence = "LOW";
  } else if (!hasAutomatedEvidence) {
    // Only manual / static / smoke / telemetry proof — the lowest tier.
    status = manualOnly ? "MANUAL" : "IMPLICIT";
    evidenceConfidence = "LOW";
  } else if (uniqueGapReasons.length === 0 && hasStrongDirectEvidence) {
    status = "COVERED";
    evidenceConfidence = "HIGH";
  } else if (uniqueGapReasons.length === 0) {
    status = "COVERED";
    evidenceConfidence = "MEDIUM";
  } else {
    status = "PARTIAL";
    evidenceConfidence = "MEDIUM";
  }

  // Accepted-risk waiver: if a human has accepted this check's blocking gap
  // category, that deficiency no longer lowers the quality/coverage score.
  //
  // Only the three EVIDENCE-STRENGTH categories drive `status` (and therefore the
  // score): no evidence → "missing", manual-only → "manual-only", otherwise "weak"
  // (IMPLICIT/PARTIAL). `status` is never a state category, so accepting one of the
  // state/text categories (blocked/stale/deferred/unavailable, and fallback-only
  // "failing") is intentionally count-only — those never lower the score, so there
  // is nothing to lift here. This penalty-category mapping mirrors the status ladder
  // above and the categories gap-triage `categoriesFor` emits for the same status.
  //
  // Evidence confidence is deliberately left untouched — acceptance is a decision,
  // not proof. `?? []` guards results deserialized from an out-of-version source
  // (e.g. a hosted `qc serve` box baked before accepted_gaps existed) whose
  // expectations lack the field.
  const accepted = new Set((expectation.acceptedGaps ?? []).map(lower));
  let scoreStatus = status;
  if (status !== "COVERED") {
    const penaltyCategory = !hasAnyEvidence ? "missing" : manualOnly ? "manual-only" : "weak";
    if (accepted.has(penaltyCategory)) {
      scoreStatus = "COVERED";
    }
  }

  return {
    status,
    scoreStatus,
    evidenceConfidence,
    structureProvenance: expectation.structureProvenance,
    structureConfidence: structureConfidenceLabel(expectation.structureProvenance),
    proofStrength:
      hasStrongDirectEvidence ? "strong_direct" : hasAutomatedEvidence ? "direct" : hasAnyEvidence ? "indirect" : "missing",
    hasAnyEvidence,
    hasAutomatedEvidence,
    hasStrongDirectEvidence,
    hasGateEvidence,
    hasProofGap,
    missingEvidence,
    manualOnly,
    structuralGapReasons: uniqueGapReasons
  };
}
