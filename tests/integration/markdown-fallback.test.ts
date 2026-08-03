import { performance } from "node:perf_hooks";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMarkdownFallbackBatch,
  parseTestReportMarkdown,
  scanProject
} from "@shiplightai/quality-core";
import { parseQualityMaps } from "@shiplightai/quality-map";
import {
  buildLargeMarkdownSection,
  markdownArtifactSource
} from "../fixtures/markdown-fallback/build-fixtures";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { snapshotProjectFiles } from "../fixtures/quality-projects/file-snapshot";

describe("Markdown fallback integration", () => {
  it("wires discovered Markdown artifacts into scan results", async () => {
    const fixture = await createFixtureProject("markdown-fallback-scan", [
      {
        relativePath: "specs/markdown-only/test-spec.md",
        contents: "# Test Spec: Markdown Only\n\n## Testing What\n\nScan fallback.\n"
      },
      {
        relativePath: "specs/markdown-only/test-report.md",
        contents:
          "# Test Report: Markdown Only\n\n## Coverage Matrix\n\n| Testing What | Evidence | Result | Confidence | Residual Risk |\n| --- | --- | --- | --- | --- |\n| Scan fallback | Integration | PASS | HIGH | None |\n"
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      expect(result.status).toBe("completed");
      expect(result.markdownFallback.fallbackTargets).toHaveLength(1);
      expect(result.markdownFallback.fallbackTargets[0]?.sourceClassification).toBe(
        "parsed_markdown_fallback"
      );
      expect(result.markdownFallback.fallbackTargets[0]?.coverageRows).toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("applies structured-map precedence for valid, blocking, and partial maps", () => {
    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: "structured-precedence/valid/quality-map.yaml",
        resolvedLocalPath: path.resolve(
          "tests/fixtures/markdown-fallback/structured-precedence/valid/quality-map.yaml"
        ),
        targetCandidateId: "structured-precedence/valid",
        sourcePattern: "test"
      },
      {
        projectRelativePath: "structured-precedence/blocking/quality-map.yaml",
        resolvedLocalPath: path.resolve(
          "tests/fixtures/markdown-fallback/structured-precedence/blocking/quality-map.yaml"
        ),
        targetCandidateId: "structured-precedence/blocking",
        sourcePattern: "test"
      },
      {
        projectRelativePath: "structured-precedence/partial/quality-map.yaml",
        resolvedLocalPath: path.resolve(
          "tests/fixtures/markdown-fallback/structured-precedence/partial/quality-map.yaml"
        ),
        targetCandidateId: "structured-precedence/partial",
        sourcePattern: "test"
      }
    ]);
    const batch = buildMarkdownFallbackBatch({
      sources: [
        markdownArtifactSource(
          "structured-precedence/valid/test-spec.md",
          "test_spec",
          "structured-precedence/valid"
        ),
        markdownArtifactSource(
          "structured-precedence/blocking/test-spec.md",
          "test_spec",
          "structured-precedence/blocking"
        ),
        markdownArtifactSource(
          "structured-precedence/blocking/test-report.md",
          "test_report",
          "structured-precedence/blocking"
        ),
        markdownArtifactSource(
          "structured-precedence/partial/test-spec.md",
          "test_spec",
          "structured-precedence/partial"
        )
      ],
      qualityMaps
    });

    expect(qualityMaps.results.map((result) => result.status)).toEqual(["valid", "invalid", "partial"]);
    expect(batch.fallbackTargets.map((target) => target.targetIdentity)).toEqual([
      "structured-precedence/blocking"
    ]);
    expect(batch.supplementalNarratives.map((target) => target.targetIdentity).sort()).toEqual([
      "structured-precedence/partial",
      "structured-precedence/valid"
    ]);
  });

  it("reports diagnostics without blocking parseable Markdown groups", () => {
    const batch = buildMarkdownFallbackBatch({
      sources: [
        markdownArtifactSource("diagnostics/empty/test-spec.md", "test_spec", "diagnostics/empty"),
        markdownArtifactSource(
          "diagnostics/no-headings/test-spec.md",
          "test_spec",
          "diagnostics/no-headings"
        ),
        markdownArtifactSource(
          "diagnostics/duplicate/test-report.md",
          "test_report",
          "diagnostics/duplicate"
        ),
        markdownArtifactSource(
          "diagnostics/malformed-table/test-report.md",
          "test_report",
          "diagnostics/malformed-table"
        ),
        markdownArtifactSource(
          "diagnostics/missing-sections/test-spec.md",
          "test_spec",
          "diagnostics/missing-sections"
        )
      ],
      qualityMaps: { results: [], diagnostics: [] }
    });

    expect(batch.fallbackTargets.map((target) => target.targetIdentity).sort()).toEqual([
      "diagnostics/duplicate",
      "diagnostics/malformed-table",
      "diagnostics/missing-sections",
      "diagnostics/no-headings"
    ]);
    expect(batch.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "EMPTY_MARKDOWN_ARTIFACT", severity: "info" }),
        expect.objectContaining({ code: "NO_RECOGNIZED_HEADINGS", severity: "warning" }),
        expect.objectContaining({ code: "DUPLICATE_MARKDOWN_HEADING", severity: "warning" }),
        expect.objectContaining({ code: "MALFORMED_MARKDOWN_TABLE", severity: "warning" }),
        expect.objectContaining({ code: "MISSING_MARKDOWN_SECTION", severity: "warning" })
      ])
    );
  });

  it("keeps parsing read-only and local-only", async () => {
    const fixture = await createFixtureProject("markdown-read-only", [
      {
        relativePath: "specs/project/test-spec.md",
        contents: "# Test Spec: Read Only\n\n## Testing What\n\nNo mutation.\n"
      }
    ]);
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("External fetch is not allowed.");
    }) as typeof fetch;

    try {
      const before = await snapshotProjectFiles(fixture.root);
      await scanProject({ projectPath: fixture.root, mode: "scan" });
      const after = await snapshotProjectFiles(fixture.root);
      expect(after).toEqual(before);
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.cleanup();
    }
  });

  it("preserves large sections with bounded previews under two seconds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quality-explorer-large-markdown-"));
    const reportPath = path.join(root, "test-report.md");

    try {
      await writeFile(reportPath, buildLargeMarkdownSection(100_000), "utf8");
      const before = await stat(reportPath);
      const startedAt = performance.now();
      const parsed = parseTestReportMarkdown({
        artifactType: "test_report",
        projectRelativePath: "large/test-report.md",
        resolvedLocalPath: reportPath,
        targetCandidateId: "large",
        sourcePattern: "test"
      });
      const elapsedMs = performance.now() - startedAt;
      const after = await stat(reportPath);

      expect(parsed.sections[0]?.rawText.length).toBeGreaterThanOrEqual(100_000);
      expect(parsed.sections[0]?.previewText.length).toBeLessThanOrEqual(1_000);
      expect(elapsedMs).toBeLessThan(2_000);
      expect(after.size).toBe(before.size);
      expect(after.mtimeMs).toBe(before.mtimeMs);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
