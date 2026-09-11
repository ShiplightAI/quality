import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("release intelligence UI public contract", () => {
  it("publishes a dedicated JavaScript, type, and stylesheet entry", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve("packages/ui/package.json"), "utf8"),
    ) as {
      exports: Record<string, unknown>;
    };

    expect(packageJson.exports["./release-intelligence"]).toEqual({
      types: "./dist/release-intelligence.d.ts",
      import: "./dist/release-intelligence.js",
      default: "./dist/release-intelligence.js",
    });
    expect(packageJson.exports["./release-intelligence.css"]).toBe(
      "./dist/release-intelligence.css",
    );
    expect(existsSync(resolve("packages/ui/dist/release-intelligence.css"))).toBe(true);
  });

  it("keeps platform infrastructure outside the shared UI", () => {
    const source = [
      "AnalysisAutoRefresh.tsx",
      "AnalysisHealth.tsx",
      "AnalysisHistory.tsx",
      "AnalyzeExistingWorkflow.tsx",
      "AnalyzeWorkflowModal.tsx",
      "CopyFixPromptButton.tsx",
      "FeatureBrowser.tsx",
      "IssueEvidenceDrawer.tsx",
      "ReleaseDetail.tsx",
      "ReleaseRecordsTable.tsx",
      "ReleaseRules.tsx",
      "RepositoryFilter.tsx",
      "RunsArtifacts.tsx",
      "SystemFactDrawer.tsx",
      "host.tsx",
    ]
      .map((file) =>
        readFileSync(resolve("packages/ui/src/release-intelligence", file), "utf8"),
      )
      .join("\n");

    expect(source).not.toMatch(/@shipyard\//u);
    expect(source).not.toMatch(/drizzle-orm|bullmq|next-auth/u);
    expect(source).not.toMatch(/node:(?:fs|child_process)/u);
  });

  it("ships stable scoped layout classes for package consumers", () => {
    const sourceFiles = [
      "FeatureBrowser.tsx",
      "IssueEvidenceDrawer.tsx",
      "ReleaseDetail.tsx",
      "SystemFactDrawer.tsx",
    ];
    const source = sourceFiles
      .map((file) =>
        readFileSync(resolve("packages/ui/src/release-intelligence", file), "utf8"),
      )
      .join("\n");
    const javascript = readFileSync(
      resolve("packages/ui/dist/release-intelligence.js"),
      "utf8",
    );
    const css = readFileSync(
      resolve("packages/ui/dist/release-intelligence.css"),
      "utf8",
    );

    expect(source).not.toMatch(/\.module\.css/u);
    expect(javascript).toContain("ri-feature-layout");
    expect(javascript).toContain("ri-detail-tabs");
    expect(javascript).toContain("ri-drawer-header");
    expect(css).toMatch(/\.ri-feature-layout\s*\{[^}]*display:\s*grid/u);
    expect(css).toContain(".ri-detail-tabs");
    expect(css).toContain(".ri-drawer-header");
  });

  it("preserves the fixed-height feature workspace contract in the Explorer host", () => {
    const css = readFileSync(
      resolve(
        "apps/explorer/src/app/release-intelligence/release-preview.module.css",
      ),
      "utf8",
    );

    expect(css).toMatch(/height:\s*100dvh/u);
    expect(css).toMatch(/display:\s*flex/u);
    expect(css).toMatch(/overflow:\s*hidden/u);
    expect(css).toMatch(/@media \(max-width: 61\.99em\)/u);
  });
});
