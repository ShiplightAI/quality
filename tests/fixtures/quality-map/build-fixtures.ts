import path from "node:path";
import type { QualityMapSource } from "@shiplightai/quality-map";

export const qualityMapFixtureRoot = path.resolve("tests/fixtures/quality-map");

export function fixtureQualityMapSource(relativePath: string): QualityMapSource {
  return {
    projectRelativePath: relativePath.split(path.sep).join("/"),
    resolvedLocalPath: path.join(qualityMapFixtureRoot, relativePath),
    targetCandidateId: `fixture:${relativePath}`,
    sourcePattern: "tests/fixtures/quality-map/**/quality-map.yaml"
  };
}

export function buildLargeQualityMap(expectationCount: number, evidenceCount: number): string {
  const evidencePerExpectation = Math.ceil(evidenceCount / expectationCount);
  let createdEvidence = 0;
  const expectations: string[] = [];

  for (let expectationIndex = 0; expectationIndex < expectationCount; expectationIndex += 1) {
    const evidence: string[] = [];
    for (
      let evidenceIndex = 0;
      evidenceIndex < evidencePerExpectation && createdEvidence < evidenceCount;
      evidenceIndex += 1
    ) {
      evidence.push(`      - id: "evidence-${createdEvidence}"
        type: "integration"
        path: "tests/integration/large-${createdEvidence}.test.ts"
        command: "pnpm test"
        contexts:
          - "pr-ci"`);
      createdEvidence += 1;
    }

    expectations.push(`  - id: "expectation-${expectationIndex}"
    title: "Expectation ${expectationIndex}"
    source_type: "SOURCE"
    category: "workflow"
    priority: "P1"
    tasks:
      - id: "T${expectationIndex}"
        path: "specs/large/tasks.md"
        status: "done"
    evidence:
${evidence.join("\n")}`);
  }

  return `target:
  id: "large-target"
  name: "Large Target"
  scope: "feature"
expectations:
${expectations.join("\n")}
`;
}
