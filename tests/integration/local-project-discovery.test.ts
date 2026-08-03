import { performance } from "node:perf_hooks";
import { chmod, mkdir, mkdtemp, rm, rename, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanProject, supportedArtifactPatterns } from "@shiplightai/quality-core";
import {
  createNonQualityFiles,
  createFixtureProject,
  writeFixtureFile
} from "../fixtures/quality-projects/build-fixtures";
import { snapshotProjectFiles } from "../fixtures/quality-projects/file-snapshot";

const fixtureRoot = path.resolve("tests/fixtures/quality-projects");

describe("local project discovery", () => {
  it("covers every canonical FR-003 source pattern and ignores unrelated files", async () => {
    const result = await scanProject({
      projectPath: path.join(fixtureRoot, "complete"),
      mode: "scan"
    });

    expect(result.status).toBe("completed");
    expect(result.artifacts).toHaveLength(8);
    expect(
      supportedArtifactPatterns
        .filter((pattern) => pattern.kind !== "project_map" && pattern.kind !== "views")
        .every((pattern) => result.artifacts.some((artifact) => artifact.sourcePattern === pattern.sourcePattern))
    ).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.projectRelativePath.includes("unrelated"))).toBe(false);
    expect(result.targetCandidates.every((candidate) => candidate.label !== ".quality")).toBe(true);
  });

  it("discovers shared observation source profiles without turning them into feature targets", async () => {
    const fixture = await createFixtureProject("observation-source-profile-discovery", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "release-cli"
    name: "Release CLI"
    transport: "github-actions"
    observation_path: "quality-observations.json"
    github:
      repo: "ShiplightAI/monots"
      workflow: "publish-cli.yml"
      artifact_names:
        - "qc-observations-cli"
    auth:
      required_env:
        - "GITHUB_TOKEN"
`
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });

      expect(result.status).toBe("completed");
      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual([
        ".quality/config/observation-sources.yaml"
      ]);
      expect(result.targetCandidates).toEqual([]);
      expect(result.observationSourceProfiles.primary?.status).toBe("parsed");
      expect(result.observationSourceProfiles.primary?.document?.profiles.map((profile) => profile.id)).toEqual([
        "release-cli"
      ]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "NO_ARTIFACTS_FOUND")).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("discovers saved QC views when a primary project map is present", async () => {
    const fixture = await createFixtureProject("saved-view-discovery", [
      {
        relativePath: ".quality/project-map.yaml",
        contents:
          'project:\n  id: "mapped-project"\n  name: "Mapped Project"\nroadmap:\n  feature_order:\n    - "001-feature-one"\n    - "002-feature-two"\nfeatures:\n  - id: "001-feature-one"\n    name: "Feature One"\n  - id: "002-feature-two"\n    name: "Feature Two"\n'
      },
      {
        relativePath: ".quality/config/views.yaml",
        contents:
          'views:\n  - id: "cli"\n    name: "CLI"\n    description: "CLI product slice."\n    feature_ids:\n      - "001-feature-one"\n'
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });

      expect(result.status).toBe("completed");
      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual([
        ".quality/config/views.yaml",
        ".quality/project-map.yaml"
      ]);
      expect(result.views.primary?.status).toBe("parsed");
      expect(result.views.primary?.document?.views).toEqual([
        {
          id: "cli",
          name: "CLI",
          description: "CLI product slice.",
          featureIds: ["001-feature-one"]
        }
      ]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "UNKNOWN_SAVED_VIEW_FEATURE")).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("discovers project maps without requiring quality-evidence artifacts", async () => {
    const fixture = await createFixtureProject("project-map-discovery", [
      {
        relativePath: ".quality/project-map.yaml",
        contents:
          'project:\n  id: "quality-explorer"\n  name: "Quality Explorer"\n  source_refs:\n    - path: "docs/prd.md"\nfeatures:\n  - id: "001-feature"\n    name: "Feature One"\n'
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });

      expect(result.status).toBe("completed");
      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual([".quality/project-map.yaml"]);
      expect(result.projectMaps.primary?.map?.features.map((feature) => feature.id)).toEqual(["001-feature"]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "NO_ARTIFACTS_FOUND")).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns a completed empty result with an info diagnostic", async () => {
    const result = await scanProject({
      projectPath: path.join(fixtureRoot, "empty"),
      mode: "scan"
    });

    expect(result.status).toBe("completed");
    expect(result.artifacts).toEqual([]);
    expect(result.targetCandidates).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      severity: "info",
      code: "NO_ARTIFACTS_FOUND",
      message: "No supported quality artifacts were found.",
      affectedPath: "."
    });
  });

  it("rejects missing and non-directory project paths", async () => {
    const missing = await scanProject({
      projectPath: path.join(fixtureRoot, "diagnostics", "missing"),
      mode: "scan"
    });
    const nonDirectory = await scanProject({
      projectPath: path.join(fixtureRoot, "diagnostics", "not-directory.txt"),
      mode: "scan"
    });

    expect(missing.status).toBe("failed");
    expect(missing.diagnostics[0]?.code).toBe("MISSING_PATH");
    expect(nonDirectory.status).toBe("failed");
    expect(nonDirectory.diagnostics[0]?.code).toBe("NON_DIRECTORY_TARGET");
  });

  it("keeps readable artifacts when one target directory is unreadable", async () => {
    const fixture = await createFixtureProject("unreadable-directory", [
      {
        relativePath: "specs/readable/test-spec.md",
        contents: "# Readable"
      }
    ]);
    const blockedDirectory = path.join(fixture.root, "specs", "blocked");

    try {
      await mkdir(blockedDirectory, { recursive: true });
      await chmod(blockedDirectory, 0);

      const result = await scanProject({
        projectPath: fixture.root,
        mode: "scan"
      });

      expect(result.status).toBe("partial");
      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual(["specs/readable/test-spec.md"]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "UNREADABLE_DIRECTORY")).toBe(true);
    } finally {
      await chmod(blockedDirectory, 0o700).catch(() => undefined);
      await fixture.cleanup();
    }
  });

  it("reports unreadable matched artifact files separately from unreadable directories", async () => {
    const fixture = await createFixtureProject("unreadable-artifact", [
      {
        relativePath: "specs/readable/test-spec.md",
        contents: "# Readable"
      },
      {
        relativePath: "specs/blocked/test-report.md",
        contents: "# Blocked",
        mode: 0
      }
    ]);
    const blockedFile = path.join(fixture.root, "specs", "blocked", "test-report.md");

    try {
      const result = await scanProject({
        projectPath: fixture.root,
        mode: "scan"
      });

      expect(result.status).toBe("partial");
      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual(["specs/readable/test-spec.md"]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "UNREADABLE_ARTIFACT_FILE")).toBe(true);
    } finally {
      await chmod(blockedFile, 0o600).catch(() => undefined);
      await fixture.cleanup();
    }
  });

  it("reports duplicate artifact matches without duplicating artifacts", async () => {
    const fixture = await createFixtureProject("duplicate-artifact-match", [
      {
        relativePath: "specs/feature-a/test-spec.md",
        contents: "# Spec"
      }
    ]);
    const linkTarget = path.join(fixture.root, "specs/feature-a/test-spec.md");
    const linkDirectory = path.join(fixture.root, "specs/feature-b");
    const linkPath = path.join(linkDirectory, "test-spec.md");

    try {
      await mkdir(linkDirectory, { recursive: true });
      await symlink(linkTarget, linkPath);

      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });

      expect(result.artifacts.filter((artifact) => artifact.projectRelativePath.endsWith("test-spec.md"))).toHaveLength(
        1
      );
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "DUPLICATE_ARTIFACT_MATCH")).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not call external upload APIs during scan", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("External fetch is not allowed in local discovery.");
    }) as typeof fetch;

    try {
      await scanProject({
        projectPath: path.join(fixtureRoot, "complete"),
        mode: "scan"
      });
      await scanProject({
        projectPath: path.join(fixtureRoot, "complete"),
        mode: "refresh"
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(called).toBe(false);
  });

  it("discovers a supported artifact within five seconds alongside 1,000 unrelated files", async () => {
    const fixture = await createFixtureProject("performance", [
      {
        relativePath: ".quality/evidence/project/quality-map.yaml",
        contents: "target: project\nexpectations: []\n"
      }
    ]);

    try {
      await createNonQualityFiles(fixture.root, 1_000);
      const startedAt = performance.now();
      const result = await scanProject({ projectPath: fixture.root, mode: "scan" });
      const elapsedMs = performance.now() - startedAt;

      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual([
        ".quality/evidence/project/quality-map.yaml"
      ]);
      expect(elapsedMs).toBeLessThan(5_000);
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not mutate scanned project files during scans or refreshes", async () => {
    const fixture = await createFixtureProject("read-only", [
      {
        relativePath: "specs/project/test-spec.md",
        contents: "# Project Spec"
      },
      {
        relativePath: "src/source.txt",
        contents: "source"
      }
    ]);

    try {
      const before = await snapshotProjectFiles(fixture.root);
      await scanProject({ projectPath: fixture.root, mode: "scan" });
      await scanProject({ projectPath: fixture.root, mode: "refresh" });
      const after = await snapshotProjectFiles(fixture.root);

      expect(after).toEqual(before);
    } finally {
      await fixture.cleanup();
    }
  });

  it("refresh returns a replacement snapshot for added, removed, and renamed artifacts", async () => {
    const fixture = await createFixtureProject("refresh", [
      {
        relativePath: "specs/project/test-spec.md",
        contents: "# Project Spec"
      }
    ]);

    try {
      const initial = await scanProject({ projectPath: fixture.root, mode: "scan" });
      expect(initial.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual(["specs/project/test-spec.md"]);

      await unlink(path.join(fixture.root, "specs/project/test-spec.md"));
      await writeFixtureFile(fixture.root, "specs/project/test-report.md", "# Project Report");
      await writeFixtureFile(fixture.root, "specs/001-refresh/test-spec.md", "# Refresh");
      await rename(
        path.join(fixture.root, "specs/001-refresh/test-spec.md"),
        path.join(fixture.root, "specs/001-refresh/test-report.md")
      );

      const refreshed = await scanProject({ projectPath: fixture.root, mode: "refresh" });

      expect(refreshed.artifacts.map((artifact) => artifact.projectRelativePath)).toEqual([
        "specs/001-refresh/test-report.md",
        "specs/project/test-report.md"
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns partial diagnostics for a half-written quality map without failing the scan", async () => {
    const fixture = await createFixtureProject("half-written-quality-map", [
      {
        relativePath: ".quality/evidence/project/quality-map.yaml",
        contents: "schema_version: 1\ntarget:\n  id: my-feature\nexpectations:\n  -\n"
      },
      {
        relativePath: "specs/project/test-spec.md",
        contents: "# Still Readable"
      }
    ]);

    try {
      const result = await scanProject({ projectPath: fixture.root, mode: "refresh" });

      expect(result.status).toBe("completed");
      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).toContain("specs/project/test-spec.md");
      expect(result.qualityMaps.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "INVALID_FIELD_SHAPE",
          mapPath: ".quality/evidence/project/quality-map.yaml",
          yamlPath: "$.expectations[0]"
        })
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("skips symlinked artifacts that resolve outside the selected project", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quality-explorer-symlink-escape-"));
    const outsideFile = path.join(root, "..", `${path.basename(root)}-secret.yaml`);
    const linkPath = path.join(root, ".quality/evidence/project/quality-map.yaml");
    const secret = "schema_version: 1\nsecret_token: should-not-leak\n";

    try {
      await mkdir(path.dirname(linkPath), { recursive: true });
      await writeFile(outsideFile, secret, "utf8");
      await symlink(outsideFile, linkPath);

      const result = await scanProject({ projectPath: root, mode: "scan" });

      expect(JSON.stringify(result)).not.toContain("should-not-leak");
      expect(result.artifacts.map((artifact) => artifact.projectRelativePath)).not.toContain(
        ".quality/evidence/project/quality-map.yaml"
      );
      expect(result.diagnostics).toContainEqual({
        severity: "warning",
        code: "OUT_OF_PROJECT_ARTIFACT",
        message:
          "The artifact .quality/evidence/project/quality-map.yaml resolves outside the selected project and was skipped.",
        affectedPath: ".quality/evidence/project/quality-map.yaml"
      });
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "NO_ARTIFACTS_FOUND")).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outsideFile, { force: true });
    }
  });
});
