import path from "node:path";
import { buildMarkdownFallbackBatch } from "@shiplightai/quality-core";
import { parseQualityMaps, type QualityMapSource } from "@shiplightai/quality-map";
import { projectIndexScanResult } from "../project-index/build-fixtures";

export const analyticsFixtureRoot = path.resolve("tests/fixtures/analytics");

export function analyticsQualityMapSource(relativePath = "complete/quality-map.yaml"): QualityMapSource {
  return {
    projectRelativePath: relativePath.split(path.sep).join("/"),
    resolvedLocalPath: path.join(analyticsFixtureRoot, relativePath),
    targetCandidateId: "analytics",
    sourcePattern: "tests/fixtures/analytics/**/quality-map.yaml"
  };
}

export function analyticsStructuredResult(relativePath = "complete/quality-map.yaml") {
  const qualityMaps = parseQualityMaps([analyticsQualityMapSource(relativePath)]);
  return projectIndexScanResult({
    qualityMaps,
    markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
  });
}

export function buildLargeAnalyticsQualityMap(expectationCount: number): string {
  const expectations = Array.from({ length: expectationCount }, (_, index) => {
    const priority = index % 2 === 0 ? "P0" : "P1";
    const manual = index % 7 === 0;
    return `  - id: "analytics-${index}"
    title: "Analytics drilldown ${index}"
    source_type: "SOURCE"
    category: "release"
    priority: "${priority}"
    evidence:
      - id: "evidence-${index}"
        type: "${manual ? "manual" : "contract"}"
        path: "tests/analytics/${index}.test.ts"
        contexts:
          - "${index % 3 === 0 ? "local" : "pr-ci"}"
    proof_gap:
      summary: "${index % 11 === 0 ? "Accepted risk: large fixture." : "Large analytics residual risk."}"`;
  }).join("\n");

  return `target:
  id: "large-analytics"
  name: "Large Analytics Target"
  scope: "feature"
  aliases:
    - "baseline:large-release"
expectations:
${expectations}
`;
}
