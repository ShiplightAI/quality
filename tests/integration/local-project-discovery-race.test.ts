import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectScanTarget } from "@shiplightai/quality-core";

describe("local project discovery filesystem races", () => {
  afterEach(() => {
    vi.doUnmock("node:fs/promises");
    vi.resetModules();
  });

  it("returns a partial result when an artifact disappears before canonicalization", async () => {
    const actualFsPromises = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
    let root = "";

    try {
      root = await mkdtemp(path.join(os.tmpdir(), "quality-explorer-realpath-race-"));
      const artifactPath = path.join(root, "specs/project/test-spec.md");

      vi.doMock("node:fs/promises", () => ({
        ...actualFsPromises,
        realpath: vi.fn(async (inputPath: string) => {
          if (inputPath === artifactPath) {
            throw Object.assign(new Error("artifact vanished"), { code: "ENOENT" });
          }
          return actualFsPromises.realpath(inputPath);
        })
      }));

      await mkdir(path.dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, "# Project Spec", "utf8");

      const { findArtifacts } = await import("@shiplightai/quality-core");
      const target: ProjectScanTarget = {
        inputPath: root,
        resolvedPath: root,
        displayName: path.basename(root),
        validationStatus: "valid"
      };

      const result = await findArtifacts(target);
      const unreadableDiagnostics = result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "UNREADABLE_ARTIFACT_FILE"
      );

      expect(result.artifacts).toEqual([]);
      expect(unreadableDiagnostics).toEqual([{
        severity: "warning",
        code: "UNREADABLE_ARTIFACT_FILE",
        message:
          "The artifact specs/project/test-spec.md could not be read; readable artifacts were still returned.",
        affectedPath: "specs/project/test-spec.md"
      }]);
    } finally {
      if (root.length > 0) {
        await rm(root, { force: true, recursive: true });
      }
    }
  });
});
