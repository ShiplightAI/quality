import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMarkdownFallbackBatch,
  buildMarkdownFallbackTargets,
  parseTestReportMarkdown,
  parseTestSpecMarkdown
} from "@shiplightai/quality-core";
import { parseQualityMaps } from "@shiplightai/quality-map";
import { markdownArtifactSource } from "../fixtures/markdown-fallback/build-fixtures";

describe("Markdown fallback contract", () => {
  it("parses recognized test-spec and test-report sections with fallback attribution", () => {
    const spec = parseTestSpecMarkdown(markdownArtifactSource("markdown-only/test-spec.md", "test_spec"));
    const report = parseTestReportMarkdown(
      markdownArtifactSource("markdown-only/test-report.md", "test_report")
    );

    expect(spec.sections.map((section) => section.canonicalSectionType)).toContain("testing_what");
    expect(spec.sections.map((section) => section.canonicalSectionType)).toContain("test_cases");
    expect(report.sections.map((section) => section.canonicalSectionType)).toContain("coverage_matrix");
    expect(report.coverageRows).toEqual([
      expect.objectContaining({
        testingWhat: "Markdown-only fallback target",
        result: "PASS",
        confidence: "HIGH"
      })
    ]);
    expect(
      [...spec.sections, ...report.sections].every(
        (section) => section.sourceAttribution.sourceClassification === "parsed_markdown_fallback"
      )
    ).toBe(true);
  });

  it("uses curated heading aliases without semantic matching", () => {
    const alias = parseTestSpecMarkdown(
      markdownArtifactSource("heading-aliases/alias/test-spec.md", "test_spec")
    );
    const semantic = parseTestSpecMarkdown(
      markdownArtifactSource("heading-aliases/semantic/test-spec.md", "test_spec")
    );

    expect(alias.sections.map((section) => section.canonicalSectionType)).toContain("testing_what");
    expect(alias.sections.map((section) => section.canonicalSectionType)).toContain("test_cases");
    expect(semantic.sections.map((section) => section.canonicalSectionType)).not.toContain(
      "testing_what"
    );
    expect(semantic.sections.some((section) => section.kind === "narrative")).toBe(true);
  });

  it("builds one Markdown fallback target from Markdown-only artifacts", () => {
    const batch = buildMarkdownFallbackBatch({
      sources: [
        markdownArtifactSource("markdown-only/test-spec.md", "test_spec", "specs/markdown-only"),
        markdownArtifactSource("markdown-only/test-report.md", "test_report", "specs/markdown-only")
      ],
      qualityMaps: { results: [], diagnostics: [] }
    });

    expect(batch.fallbackTargets).toHaveLength(1);
    expect(batch.fallbackTargets[0]).toMatchObject({
      targetIdentity: "specs/markdown-only",
      sourceClassification: "parsed_markdown_fallback"
    });
    expect(batch.fallbackTargets[0]?.sections.length).toBeGreaterThan(5);
    expect(batch.fallbackTargets[0]?.coverageRows).toHaveLength(1);
    expect(batch.fallbackTargets[0]?.evidenceHints.map((hint) => hint.value)).toEqual(
      expect.arrayContaining(["pnpm test", "tests/contract/markdown-fallback.contract.test.ts"])
    );

    expect(buildMarkdownFallbackTargets(batch)).toBe(batch.fallbackTargets);
  });

  it("keeps fallback identity stable when H1 display titles change", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quality-explorer-markdown-id-"));
    const first = path.join(root, "test-spec-first.md");
    const second = path.join(root, "test-spec-second.md");

    try {
      await writeFile(first, "# First Title\n\n## Testing What\n\nStable identity.\n", "utf8");
      await writeFile(second, "# Second Title\n\n## Testing What\n\nStable identity.\n", "utf8");

      const baseSource = {
        artifactType: "test_spec" as const,
        projectRelativePath: "specs/stable/test-spec.md",
        targetCandidateId: "specs/stable",
        sourcePattern: "test"
      };
      const firstBatch = buildMarkdownFallbackBatch({
        sources: [{ ...baseSource, resolvedLocalPath: first }],
        qualityMaps: { results: [], diagnostics: [] }
      });
      const secondBatch = buildMarkdownFallbackBatch({
        sources: [{ ...baseSource, resolvedLocalPath: second }],
        qualityMaps: { results: [], diagnostics: [] }
      });

      expect(firstBatch.fallbackTargets[0]?.targetIdentity).toBe("specs/stable");
      expect(secondBatch.fallbackTargets[0]?.targetIdentity).toBe("specs/stable");
      expect(firstBatch.fallbackTargets[0]?.displayLabel).toBe("First Title");
      expect(secondBatch.fallbackTargets[0]?.displayLabel).toBe("Second Title");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("preserves linked paths, commands, and URLs without external access", () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("External fetch is not allowed.");
    }) as typeof fetch;

    try {
      const report = parseTestReportMarkdown(
        markdownArtifactSource("markdown-only/test-report.md", "test_report")
      );
      expect(report.evidenceHints.map((hint) => hint.value)).toEqual(
        expect.arrayContaining(["pnpm test", "specs/003-markdown-fallback/spec.md"])
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(called).toBe(false);
  });

  it("suppresses duplicate fallback targets when a usable structured graph exists", () => {
    const qualityMaps = parseQualityMaps([
      {
        projectRelativePath: "structured-precedence/valid/quality-map.yaml",
        resolvedLocalPath: path.join(
          "tests/fixtures/markdown-fallback",
          "structured-precedence/valid/quality-map.yaml"
        ),
        targetCandidateId: "structured-precedence/valid",
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
          "structured-precedence/valid/test-report.md",
          "test_report",
          "structured-precedence/valid"
        )
      ],
      qualityMaps
    });

    expect(qualityMaps.results[0]?.status).toBe("valid");
    expect(batch.fallbackTargets).toEqual([]);
    expect(batch.supplementalNarratives).toHaveLength(1);
    expect(batch.supplementalNarratives[0]?.targetIdentity).toBe("structured-precedence/valid");
  });
});
