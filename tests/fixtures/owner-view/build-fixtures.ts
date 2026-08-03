import path from "node:path";
import { buildMarkdownFallbackBatch } from "@shiplightai/quality-core";
import { parseQualityMaps } from "@shiplightai/quality-map";
import { markdownArtifactSource } from "../markdown-fallback/build-fixtures";
import { projectIndexScanResult } from "../project-index/build-fixtures";

export function ownerStructuredResult() {
  const qualityMaps = parseQualityMaps([
    {
      projectRelativePath: "owner/quality-map.yaml",
      resolvedLocalPath: path.resolve("tests/fixtures/owner-view/structured/quality-map.yaml"),
      targetCandidateId: "owner",
      sourcePattern: "test"
    }
  ]);
  return projectIndexScanResult({
    qualityMaps,
    markdownFallback: buildMarkdownFallbackBatch({ sources: [], qualityMaps })
  });
}

export function ownerFallbackResult() {
  const qualityMaps = parseQualityMaps([]);
  const markdownFallback = buildMarkdownFallbackBatch({
    sources: [
      markdownArtifactSource("../owner-view/fallback/test-spec.md", "test_spec", "owner-fallback"),
      markdownArtifactSource("../owner-view/fallback/test-report.md", "test_report", "owner-fallback")
    ],
    qualityMaps
  });
  return projectIndexScanResult({ qualityMaps, markdownFallback });
}
