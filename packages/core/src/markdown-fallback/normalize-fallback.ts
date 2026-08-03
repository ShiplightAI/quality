import path from "node:path";
import type { NormalizedQualityGraphResult } from "@shiplightai/quality-map";
import { parseTestReportMarkdown } from "./parse-report";
import { parseTestSpecMarkdown } from "./parse-spec";
import type {
  BuildMarkdownFallbackInput,
  FallbackTarget,
  MarkdownArtifactSource,
  MarkdownFallbackBatch,
  ParsedMarkdownArtifact,
  SupplementalMarkdownNarrative
} from "./types";

function targetIdentityFor(source: MarkdownArtifactSource): string {
  return source.targetCandidateId ?? path.posix.dirname(source.projectRelativePath);
}

function parseSource(source: MarkdownArtifactSource): ParsedMarkdownArtifact {
  return source.artifactType === "test_spec"
    ? parseTestSpecMarkdown(source)
    : parseTestReportMarkdown(source);
}

function hasUsableQualityMap(
  qualityMapResults: readonly NormalizedQualityGraphResult[],
  targetIdentity: string
): boolean {
  return qualityMapResults.some(
    (result) => result.source.targetCandidateId === targetIdentity && result.graph !== undefined
  );
}

function displayLabelFor(targetIdentity: string, parsedArtifacts: readonly ParsedMarkdownArtifact[]): string {
  return (
    parsedArtifacts.find((artifact) => artifact.displayLabel !== undefined)?.displayLabel ??
    targetIdentity
  );
}

function buildFallbackTarget(
  targetIdentity: string,
  parsedArtifacts: readonly ParsedMarkdownArtifact[]
): FallbackTarget {
  return {
    targetIdentity,
    displayLabel: displayLabelFor(targetIdentity, parsedArtifacts),
    sourceClassification: "parsed_markdown_fallback",
    sourceArtifacts: parsedArtifacts.map((artifact) => artifact.source),
    sections: parsedArtifacts.flatMap((artifact) => artifact.sections),
    coverageRows: parsedArtifacts.flatMap((artifact) => artifact.coverageRows),
    evidenceHints: parsedArtifacts.flatMap((artifact) => artifact.evidenceHints),
    findings: parsedArtifacts.flatMap((artifact) => artifact.findings),
    residualRisks: parsedArtifacts.flatMap((artifact) => artifact.residualRisks),
    diagnostics: parsedArtifacts.flatMap((artifact) => artifact.diagnostics)
  };
}

function buildSupplementalNarrative(
  targetIdentity: string,
  parsedArtifacts: readonly ParsedMarkdownArtifact[]
): SupplementalMarkdownNarrative {
  return {
    targetIdentity,
    sourceClassification: "parsed_markdown_fallback",
    sourceArtifacts: parsedArtifacts.map((artifact) => artifact.source),
    sections: parsedArtifacts.flatMap((artifact) => artifact.sections),
    diagnostics: parsedArtifacts.flatMap((artifact) => artifact.diagnostics)
  };
}

export function buildMarkdownFallbackBatch(
  input: BuildMarkdownFallbackInput
): MarkdownFallbackBatch {
  const groupedSources = new Map<string, MarkdownArtifactSource[]>();
  for (const source of input.sources) {
    const targetIdentity = targetIdentityFor(source);
    const group = groupedSources.get(targetIdentity) ?? [];
    group.push(source);
    groupedSources.set(targetIdentity, group);
  }

  const fallbackTargets: FallbackTarget[] = [];
  const supplementalNarratives: SupplementalMarkdownNarrative[] = [];
  const parsedArtifacts: ParsedMarkdownArtifact[] = [];
  const qualityMapResults = input.qualityMaps?.results ?? [];

  for (const [targetIdentity, sources] of [...groupedSources.entries()].toSorted((left, right) =>
    left[0].localeCompare(right[0])
  )) {
    const parsedGroup = sources
      .toSorted((left, right) => left.projectRelativePath.localeCompare(right.projectRelativePath))
      .map(parseSource);
    parsedArtifacts.push(...parsedGroup);

    if (hasUsableQualityMap(qualityMapResults, targetIdentity)) {
      supplementalNarratives.push(buildSupplementalNarrative(targetIdentity, parsedGroup));
      continue;
    }

    if (parsedGroup.some((artifact) => artifact.status === "parsed" && artifact.sections.length > 0)) {
      fallbackTargets.push(buildFallbackTarget(targetIdentity, parsedGroup));
    }
  }

  return {
    fallbackTargets,
    supplementalNarratives,
    parsedArtifacts,
    diagnostics: parsedArtifacts.flatMap((artifact) => artifact.diagnostics)
  };
}

export function buildMarkdownFallbackTargets(
  input: BuildMarkdownFallbackInput | MarkdownFallbackBatch
): readonly FallbackTarget[] {
  if ("fallbackTargets" in input) {
    return input.fallbackTargets;
  }

  return buildMarkdownFallbackBatch(input).fallbackTargets;
}
