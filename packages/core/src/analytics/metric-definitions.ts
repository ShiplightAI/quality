import type { MetricDefinition } from "./types";

export const metricDefinitions = [
  {
    metricId: "p0p1-direct-evidence",
    title: "P0/P1 Direct Evidence",
    formulaName: "explicit-p0-p1-direct-structural-evidence-ratio",
    numeratorDefinition: "P0/P1 quality checks with direct structural evidence",
    denominatorDefinition: "Quality checks explicitly labeled P0 or P1",
    includedCriteria: "Priority must be exactly P0 or P1; evidence depth must be DIRECT.",
    excludedCriteria: "Non-P0/P1 priorities and source priorities without a mapping are excluded.",
    limitations: ["No priority inference is performed.", "Pass/fail is outside the structural-only view.", "This is not a release guarantee."]
  },
  {
    metricId: "p0p1-gated-evidence",
    title: "P0/P1 Gated Evidence",
    formulaName: "explicit-p0-p1-gate-context-evidence-ratio",
    numeratorDefinition: "P0/P1 quality checks with explicit gate-context evidence",
    denominatorDefinition: "Quality checks explicitly labeled P0 or P1",
    includedCriteria: "Priority must be exactly P0 or P1; evidence contexts must include a gate-like context such as ci, staging-gate, release, or prod-smoke.",
    excludedCriteria: "Ungated or context-free evidence is excluded from the numerator.",
    limitations: ["Gate semantics come only from explicit contexts.", "This is not a universal quality score."]
  },
  {
    metricId: "stale-evidence",
    title: "Stale Evidence",
    formulaName: "source-marked-stale-count",
    numeratorDefinition: "Gap records explicitly marked stale by source context",
    denominatorDefinition: "All source-backed gap records",
    includedCriteria: "Gap category must be stale.",
    excludedCriteria: "Old timestamps without stale source context are excluded.",
    limitations: ["No timestamp threshold is inferred."]
  },
  {
    metricId: "manual-only-exposure",
    title: "Manual-Only Exposure",
    formulaName: "manual-only-gap-count",
    numeratorDefinition: "Manual-only gap records",
    denominatorDefinition: "All source-backed gap records",
    includedCriteria: "Gap category must be manual-only.",
    excludedCriteria: "Manual evidence with direct passing proof on the same quality check is excluded.",
    limitations: ["Manual review is context, not proof of automation."]
  },
  {
    metricId: "missing-evidence",
    title: "Missing Evidence",
    formulaName: "missing-gap-count",
    numeratorDefinition: "Missing evidence gap records",
    denominatorDefinition: "All source-backed gap records",
    includedCriteria: "Gap category must be missing.",
    excludedCriteria: "Partial evidence is not counted as missing.",
    limitations: ["Missing source fields are labeled unavailable."]
  },
  {
    metricId: "accepted-risks",
    title: "Accepted Impact",
    formulaName: "accepted-risk-context-count",
    numeratorDefinition: "Evidence gap records whose source text marks impact as accepted",
    denominatorDefinition: "All source-backed evidence gap records",
    includedCriteria: "Impact or recommended action text must contain accepted context.",
    excludedCriteria: "Resolved gaps without accepted context are excluded.",
    limitations: ["Accepted impact is not treated as resolved proof."]
  },
  {
    metricId: "deferred-risks",
    title: "Deferred Gaps",
    formulaName: "deferred-risk-context-count",
    numeratorDefinition: "Evidence gap records whose source text marks deferral",
    denominatorDefinition: "All source-backed evidence gap records",
    includedCriteria: "Gap category deferred or impact context contains deferred.",
    excludedCriteria: "Accepted-only impacts are excluded.",
    limitations: ["Deferred gaps are not treated as resolved proof."]
  }
] as const satisfies readonly MetricDefinition[];

export function metricDefinitionFor(metricId: string): MetricDefinition {
  const definition = metricDefinitions.find((candidate) => candidate.metricId === metricId);
  if (definition === undefined) {
    throw new Error(`Unknown metric definition: ${metricId}`);
  }

  return definition;
}
