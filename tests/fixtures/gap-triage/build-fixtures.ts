import path from "node:path";
import { buildMarkdownFallbackBatch, type MarkdownArtifactSource } from "@shiplightai/quality-core";
import { parseQualityMaps, type QualityMapSource } from "@shiplightai/quality-map";
import { projectIndexScanResult } from "../project-index/build-fixtures";

export const gapTriageFixtureRoot = path.resolve("tests/fixtures/gap-triage");

export function gapQualityMapSource(relativePath = "complete/quality-map.yaml"): QualityMapSource {
  return {
    projectRelativePath: relativePath.split(path.sep).join("/"),
    resolvedLocalPath: path.join(gapTriageFixtureRoot, relativePath),
    targetCandidateId: "gap-triage",
    sourcePattern: "tests/fixtures/gap-triage/**/quality-map.yaml"
  };
}

export function gapMarkdownSource(
  relativePath: string,
  artifactType: "test_spec" | "test_report"
): MarkdownArtifactSource {
  return {
    artifactType,
    projectRelativePath: relativePath.split(path.sep).join("/"),
    resolvedLocalPath: path.join(gapTriageFixtureRoot, relativePath),
    targetCandidateId: "fallback-gap",
    sourcePattern: "tests/fixtures/gap-triage/**/*.md"
  };
}

export function gapStructuredResult() {
  const qualityMaps = parseQualityMaps([gapQualityMapSource()]);
  return projectIndexScanResult({
    qualityMaps,
    markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
  });
}

export function gapFallbackResult() {
  const qualityMaps = parseQualityMaps([]);
  const markdownFallback = buildMarkdownFallbackBatch({
    sources: [
      gapMarkdownSource("fallback/test-spec.md", "test_spec"),
      gapMarkdownSource("fallback/test-report.md", "test_report")
    ],
    qualityMaps
  });

  return projectIndexScanResult({ qualityMaps, markdownFallback });
}

export function buildLargeGapQualityMap(expectationCount: number): string {
  const states = ["BLOCKED", "DEFERRED", "FAIL", "NOT RUN"];
  const expectations = Array.from({ length: expectationCount }, (_, index) => {
    const state = states[index % states.length] ?? "NOT RUN";
    const manual = index % 5 === 0;

    return `  - id: "gap-${index}"
    title: "Large gap ${index}"
    source_type: "SOURCE"
    category: "release"
    priority: "${index % 2 === 0 ? "P1" : "P2"}"
    evidence:
      - id: "evidence-${index}"
        type: "${manual ? "manual" : "integration"}"
        path: "tests/large/gap-${index}.test.ts"
    proof_gap:
      summary: "Large fixture residual risk ${index}${state === "DEFERRED" ? " deferred" : state === "NOT RUN" ? " unavailable" : ""}"
      next_step: "Add focused proof ${index}"`;
  }).join("\n");

  return `target:
  id: "large-gap-target"
  name: "Large Gap Target"
  scope: "feature"
expectations:
${expectations}
`;
}
