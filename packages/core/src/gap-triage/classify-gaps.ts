import type {
  NormalizedEvidenceEntry,
  NormalizedExpectation,
  NormalizedQualityGraph,
  NormalizedQualityGraphResult
} from "@shiplightai/quality-map";
import type { FallbackCoverageRow, FallbackTarget } from "../markdown-fallback/types";
import {
  deriveExpectationAssessment,
  evidenceForExpectation,
  isAutomatedType,
  proofTier
} from "../quality-structure/assessment";
import {
  markdownDiagnostic,
  markdownAttribution,
  structuredAttribution,
  structuredDiagnostic,
  unavailable
} from "../evidence-view";
import type { IndexSourceReference } from "../project-index/types";
import type {
  GapCategory,
  GapEvidenceSummary,
  GapRecord,
  NextUsefulProofContext
} from "./types";

const categoryLabels: Record<GapCategory, string> = {
  missing: "Missing evidence",
  stale: "Stale evidence",
  deferred: "Deferred evidence",
  "manual-only": "Manual-only evidence",
  weak: "Weak evidence",
  failing: "Failing evidence",
  unavailable: "Unavailable evidence"
};

export const gapCategoryOrder: readonly GapCategory[] = [
  "missing",
  "stale",
  "deferred",
  "manual-only",
  "weak",
  "failing",
  "unavailable"
];

function lower(value: string | undefined | null): string {
  return (value ?? "").toLowerCase();
}

function includesStandaloneTerm(value: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9-])${escaped}($|[^a-z0-9-])`).test(value);
}

function includesStandaloneAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => includesStandaloneTerm(value, term));
}

function compact(values: readonly (string | undefined | null)[]): string {
  const present = values.filter((value): value is string => value !== undefined && value !== null && value.length > 0);

  return present.length === 0 ? "unavailable" : [...new Set(present)].join(", ");
}

function sourceReferencesFor(graph: NormalizedQualityGraph): readonly IndexSourceReference[] {
  return [
    { label: "Quality map", path: graph.source.projectRelativePath },
    ...graph.sourceRefs.map((sourceRef) => ({
      label: sourceRef.label,
      path: sourceRef.path,
      url: sourceRef.url
    }))
  ];
}

function evidenceSummary(
  evidence: NormalizedEvidenceEntry
): GapEvidenceSummary {
  return {
    evidenceId: evidence.normalizedId,
    label: evidence.localId,
    type: evidence.type,
    depth: proofTier(evidence.type),
    ...(evidence.path === undefined ? {} : { path: evidence.path }),
    ...(evidence.url === undefined ? {} : { url: evidence.url }),
    ...(evidence.command === undefined ? {} : { command: evidence.command }),
    pathOrUrl: unavailable(evidence.path ?? evidence.url ?? evidence.command)
  };
}

function isWeakEvidence(
  evidenceEntries: readonly NormalizedEvidenceEntry[]
): boolean {
  if (evidenceEntries.length === 0) {
    return false;
  }

  // An automated proof suppresses weak classification caused by sidecar
  // manual/static evidence on the same expectation.
  if (evidenceEntries.some((evidence) => isAutomatedType(evidence.type))) {
    return false;
  }

  // Only manual / static / smoke / telemetry proof remains — weak.
  return true;
}

function categoriesFor(input: {
  readonly graph: NormalizedQualityGraph;
  readonly expectation: NormalizedExpectation;
  readonly evidenceEntries: readonly NormalizedEvidenceEntry[];
  readonly residualRisk: string;
  readonly nextBestProof: string;
  readonly assessmentStatus: string;
  readonly structuralGapReasons: readonly string[];
}): readonly GapCategory[] {
  const categories = new Set<GapCategory>();
  const evidenceEntries = input.evidenceEntries;
  const evidenceText = [
    ...evidenceEntries.flatMap((evidence) => [
      evidence.type,
      evidence.path,
      evidence.url,
      evidence.command
    ]),
    input.residualRisk,
    input.nextBestProof,
    input.assessmentStatus,
    ...input.structuralGapReasons
  ].map(lower).join(" ");

  if (evidenceEntries.length === 0) {
    categories.add("missing");
  }

  if (includesStandaloneAny(evidenceText, ["deferred"])) {
    categories.add("deferred");
  }

  if (includesStandaloneAny(evidenceText, ["stale"])) {
    categories.add("stale");
  }

  if (evidenceEntries.length > 0 && evidenceEntries.every((evidence) => lower(evidence.type) === "manual")) {
    categories.add("manual-only");
  }

  if (
    input.assessmentStatus.toLowerCase() === "partial" ||
    input.assessmentStatus.toLowerCase() === "implicit" ||
    isWeakEvidence(evidenceEntries)
  ) {
    categories.add("weak");
  }

  if (evidenceEntries.some((evidence) => {
    return (
      evidence.path === undefined &&
      evidence.url === undefined &&
      evidence.command === undefined
    );
  })) {
    categories.add("unavailable");
  }

  return gapCategoryOrder.filter((category) => categories.has(category));
}

export const NO_SOURCE_PROVIDED_NEXT_EVIDENCE = "No source-provided recommended action";

function nextProof(text: string | undefined | null, sourceAttribution?: NextUsefulProofContext["sourceAttribution"]): NextUsefulProofContext {
  if (text === undefined || text === null || text.length === 0) {
    return {
      text: NO_SOURCE_PROVIDED_NEXT_EVIDENCE,
      availability: "unavailable",
      sourceAttribution
    };
  }

  return {
    text,
    availability: "source-provided",
    sourceAttribution
  };
}

export function classifyStructuredGaps(
  result: NormalizedQualityGraphResult
): readonly GapRecord[] {
  const graph = result.graph;
  if (graph === undefined) {
    return [];
  }

  const sourceReferences = sourceReferencesFor(graph);
  const diagnostics = result.diagnostics.map(structuredDiagnostic);

  return graph.expectations.flatMap((expectation) => {
    const evidenceEntries = evidenceForExpectation(graph, expectation);
    const assessment = deriveExpectationAssessment(graph, expectation);
    const residualRisks = graph.residualRisks.filter((risk) =>
      expectation.residualRiskIds.includes(risk.normalizedId)
    );
    const residualRisk = compact(residualRisks.map((risk) => risk.text));
    const next = nextProof(
      expectation.proofGapNextStep,
      structuredAttribution(expectation.sourceAttribution)
    );
    const categories = categoriesFor({
      graph,
      expectation,
      evidenceEntries,
      residualRisk,
      nextBestProof: next.text,
      assessmentStatus: assessment.status,
      structuralGapReasons: assessment.structuralGapReasons
    });
    const evidence = evidenceEntries.map((entry) => evidenceSummary(entry));
    const relatedDiagnostics = diagnostics.filter((diagnostic) =>
      diagnostic.affectedId === expectation.localId ||
      evidenceEntries.some((entry) => diagnostic.affectedId === entry.localId)
    );
    // `?? []` guards results deserialized from an out-of-version source (e.g. a hosted
    // `qc serve` box baked before accepted_gaps existed) whose expectations lack the field.
    const acceptedGaps = new Set((expectation.acceptedGaps ?? []).map((entry) => entry.toLowerCase()));

    return categories.map((category) => ({
      gapId: `${expectation.normalizedId}#gap:${category}`,
      accepted: acceptedGaps.has(category),
      category,
      categoryLabel: categoryLabels[category],
      targetId: graph.target.normalizedId,
      expectationId: expectation.normalizedId,
      expectationTitle: expectation.title,
      priority: unavailable(expectation.priority),
      expectationCategory: unavailable(expectation.category),
      evidenceState: compact(evidence.map((item) => item.type)),
      evidenceDepth: compact(evidence.map((item) => item.depth)),
      evidence,
      residualRisk,
      nextProof: next,
      sourceClassification: "structured_quality_map",
      sourceReferences,
      sourceAttribution: structuredAttribution(expectation.sourceAttribution),
      diagnostics: relatedDiagnostics,
      relatedCategoryIds: categories
    } satisfies GapRecord));
  });
}

function fallbackCategories(row: FallbackCoverageRow | undefined, hasEvidence: boolean): readonly GapCategory[] {
  const categories = new Set<GapCategory>();
  const text = lower(`${row?.result ?? ""} ${row?.evidence ?? ""} ${row?.residualRisk ?? ""}`);

  if (!hasEvidence) {
    categories.add("missing");
  }
  if (includesStandaloneTerm(text, "deferred")) {
    categories.add("deferred");
  }
  if (includesStandaloneTerm(text, "stale")) {
    categories.add("stale");
  }
  if (includesStandaloneTerm(text, "fail")) {
    categories.add("failing");
  }
  if (hasEvidence && !text.includes("pass")) {
    categories.add("weak");
  }

  return gapCategoryOrder.filter((category) => categories.has(category));
}

export function classifyFallbackGaps(target: FallbackTarget): readonly GapRecord[] {
  const sourceReferences: readonly IndexSourceReference[] = target.sourceArtifacts.map((source) => ({
    label: source.artifactType === "test_spec" ? "Test spec" : "Test report",
    path: source.projectRelativePath
  }));
  const diagnostics = target.diagnostics.map(markdownDiagnostic);
  const hasHints = target.evidenceHints.length > 0;

  return target.sections.flatMap((section, index) => {
    const row = target.coverageRows[index];
    const expectationId = `${target.targetIdentity}#section:${index}`;
    const hasEvidence = hasHints || row?.evidence !== undefined;
    const categories = fallbackCategories(row, hasEvidence);
    const evidence: readonly GapEvidenceSummary[] = hasEvidence
      ? (target.evidenceHints.length > 0 ? target.evidenceHints : [{ value: row?.evidence ?? "unavailable", type: "path" as const }]).map((hint, hintIndex) => ({
          evidenceId: `${expectationId}#fallback-evidence:${hintIndex}`,
          label: hint.value,
          type: hint.type,
          depth: "parsed markdown fallback",
          state: unavailable(row?.result),
          ...(hint.type === "path" ? { path: hint.value } : {}),
          ...(hint.type === "url" ? { url: hint.value } : {}),
          ...(hint.type === "command" ? { command: hint.value } : {}),
          pathOrUrl: hint.value
        }))
      : [];
    const residualRisk = unavailable(row?.residualRisk ?? target.residualRisks[0]?.previewText);

    return categories.map((category) => ({
      gapId: `${expectationId}#gap:${category}`,
      category,
      categoryLabel: categoryLabels[category],
      targetId: target.targetIdentity,
      expectationId,
      expectationTitle: section.headingText,
      priority: "unknown",
      expectationCategory: section.canonicalSectionType ?? "narrative",
      evidenceState: unavailable(row?.result),
      evidenceDepth: "parsed markdown fallback",
      evidence,
      residualRisk,
      nextProof: nextProof(undefined, markdownAttribution(section.sourceAttribution)),
      sourceClassification: "parsed_markdown_fallback",
      sourceReferences,
      sourceAttribution: markdownAttribution(section.sourceAttribution),
      diagnostics: diagnostics.filter((diagnostic) => diagnostic.affectedId === section.headingPath),
      relatedCategoryIds: categories,
      // Parsed-markdown fallback has no structured check to carry an acceptance decision.
      accepted: false
    } satisfies GapRecord));
  });
}
