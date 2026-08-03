import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkspace, scanProject, selectWorkspaceTarget } from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { snapshotProjectFiles } from "../fixtures/quality-projects/file-snapshot";

async function fixtureQualityMap(relativeFixture: string): Promise<string> {
  return readFile(path.resolve(relativeFixture), "utf8");
}

describe("modern workspace integration", () => {
  it("builds a dashboard and target workspace from scanned structured and Markdown targets", async () => {
    const fixture = await createFixtureProject("modern-workspace", [
      {
        relativePath: ".quality/evidence/gap-target/quality-map.yaml",
        contents: await fixtureQualityMap("tests/fixtures/gap-triage/complete/quality-map.yaml")
      },
      {
        relativePath: "specs/fallback/test-spec.md",
        contents: "# Test Spec: Fallback Workspace Target\n\n## Testing What\n\nFallback target.\n"
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const dashboard = buildWorkspace({ result });
      const selected = buildWorkspace({
        result,
        navigation: selectWorkspaceTarget(dashboard.targets[0]!.targetId)
      });

      expect(dashboard.summary.targetCount).toBe(2);
      expect(dashboard.targets.map((target) => target.name)).toContain("Fallback Workspace Target");
      expect(selected.sections.map((section) => section.title)).toEqual([
        "Checks",
        "Evidence",
        "Gaps",
        "Release",
        "Artifacts"
      ]);
      expect(selected.artifactRecords.length).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not mutate source artifacts while deriving workspace state and details", async () => {
    const fixture = await createFixtureProject("modern-workspace-read-only", [
      {
        relativePath: ".quality/evidence/project/quality-map.yaml",
        contents: await fixtureQualityMap("tests/fixtures/evidence-view/complete/quality-map.yaml")
      }
    ]);

    try {
      const before = await snapshotProjectFiles(fixture.root);
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const dashboard = buildWorkspace({ result });
      const workspace = buildWorkspace({
        result,
        navigation: selectWorkspaceTarget(dashboard.targets[0]!.targetId)
      });
      const after = await snapshotProjectFiles(fixture.root);

      expect(workspace.selectedTarget?.name).toBe("Evidence Target");
      expect(workspace.artifactRecords.length).toBeGreaterThan(0);
      expect(after).toEqual(before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("summarizes many targets without rendering a raw artifact-first model", async () => {
    const files = Array.from({ length: 100 }, (_, index) => ({
      relativePath: `specs/target-${String(index).padStart(3, "0")}/test-spec.md`,
      contents: `# Test Spec: Workspace Target ${index}\n\n## Testing What\n\nLarge target ${index}.\n`
    }));
    const fixture = await createFixtureProject("modern-workspace-large", files);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const workspace = buildWorkspace({ result });

      expect(workspace.summary.targetCount).toBe(100);
      expect(workspace.targets).toHaveLength(100);
      expect(workspace.summary.artifactCount).toBe(100);
      expect(workspace.selectedTarget).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });
});
