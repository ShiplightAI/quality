import path from "node:path";
import { buildMarkdownFallbackBatch, type MarkdownArtifactSource } from "@shiplightai/quality-core";
import { parseQualityMaps, type QualityMapSource } from "@shiplightai/quality-map";
import { projectIndexScanResult } from "../project-index/build-fixtures";

export const evidenceViewFixtureRoot = path.resolve("tests/fixtures/evidence-view");

export function evidenceQualityMapSource(relativePath = "complete/quality-map.yaml"): QualityMapSource {
  return {
    projectRelativePath: relativePath.split(path.sep).join("/"),
    resolvedLocalPath: path.join(evidenceViewFixtureRoot, relativePath),
    targetCandidateId: "evidence-view",
    sourcePattern: "tests/fixtures/evidence-view/**/quality-map.yaml"
  };
}

export function evidenceMarkdownSource(
  relativePath: string,
  artifactType: "test_spec" | "test_report"
): MarkdownArtifactSource {
  return {
    artifactType,
    projectRelativePath: relativePath.split(path.sep).join("/"),
    resolvedLocalPath: path.join(evidenceViewFixtureRoot, relativePath),
    targetCandidateId: "fallback-evidence",
    sourcePattern: "tests/fixtures/evidence-view/**/*.md"
  };
}

export function evidenceStructuredResult() {
  const qualityMaps = parseQualityMaps([evidenceQualityMapSource()]);
  return projectIndexScanResult({
    qualityMaps,
    markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
  });
}

export function evidenceFallbackResult() {
  const qualityMaps = parseQualityMaps([]);
  const markdownFallback = buildMarkdownFallbackBatch({
    sources: [
      evidenceMarkdownSource("fallback/test-spec.md", "test_spec"),
      evidenceMarkdownSource("fallback/test-report.md", "test_report")
    ],
    qualityMaps
  });

  return projectIndexScanResult({ qualityMaps, markdownFallback });
}

export function evidenceStructuredResultWithSharedCanonical() {
  const result = evidenceStructuredResult();
  const graphResult = result.qualityMaps.results[0];
  const graph = graphResult?.graph;

  if (graphResult === undefined || graph === undefined) {
    throw new Error("Expected structured evidence graph fixture.");
  }

  const sharedEvidence = graph.evidence[0];
  const secondExpectation = graph.expectations[1];

  if (sharedEvidence === undefined || secondExpectation === undefined) {
    throw new Error("Expected shared evidence fixture inputs.");
  }

  const graphWithSharedEvidence = {
    ...graph,
    expectations: graph.expectations.map((expectation) =>
      expectation.normalizedId === secondExpectation.normalizedId
        ? {
            ...expectation,
            linkedEvidenceIds: [...expectation.linkedEvidenceIds, sharedEvidence.normalizedId]
          }
        : expectation
    ),
    evidence: [
      ...graph.evidence,
      {
        ...sharedEvidence,
        expectationId: secondExpectation.normalizedId
      }
    ]
  };

  return {
    ...result,
    qualityMaps: {
      ...result.qualityMaps,
      results: [
        {
          ...graphResult,
          graph: graphWithSharedEvidence
        },
        ...result.qualityMaps.results.slice(1)
      ]
    }
  };
}

export function buildEvidenceLargeQualityMap(expectationCount: number, evidenceCount: number): string {
  const evidencePerExpectation = Math.ceil(evidenceCount / expectationCount);
  let createdEvidence = 0;
  const expectations: string[] = [];

  for (let expectationIndex = 0; expectationIndex < expectationCount; expectationIndex += 1) {
    const evidenceRows: string[] = [];
    for (
      let evidenceIndex = 0;
      evidenceIndex < evidencePerExpectation && createdEvidence < evidenceCount;
      evidenceIndex += 1
    ) {
      evidenceRows.push(`      - id: "evidence-${createdEvidence}"
        type: "integration"
        path: "tests/integration/evidence-${createdEvidence}.test.ts"
        command: "pnpm test -- evidence-${createdEvidence}"
        contexts:
          - "pr-ci"`);
      createdEvidence += 1;
    }

    expectations.push(`  - id: "expectation-${expectationIndex}"
    title: "Large expectation ${expectationIndex}"
    source_type: "SOURCE"
    category: "performance"
    priority: "P1"
    evidence:
${evidenceRows.join("\n")}
`);
  }

  return `target:
  id: "large-evidence"
  name: "Large Evidence Target"
  scope: "feature"
expectations:
${expectations.join("\n")}
`;
}
