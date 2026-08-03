import path from "node:path";
import type { MarkdownArtifactSource } from "@shiplightai/quality-core";

export const markdownFallbackFixtureRoot = path.resolve("tests/fixtures/markdown-fallback");

export function markdownArtifactSource(
  relativePath: string,
  artifactType: "test_spec" | "test_report",
  targetCandidateId = path.posix.dirname(relativePath.split(path.sep).join("/"))
): MarkdownArtifactSource {
  return {
    artifactType,
    projectRelativePath: relativePath.split(path.sep).join("/"),
    resolvedLocalPath: path.join(markdownFallbackFixtureRoot, relativePath),
    targetCandidateId,
    sourcePattern: "tests/fixtures/markdown-fallback/**/*.md"
  };
}

export function buildLargeMarkdownSection(characterCount: number): string {
  return `# Test Report: Large Target

## Summary

${"A".repeat(characterCount)}
`;
}
