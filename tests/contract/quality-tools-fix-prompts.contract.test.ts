import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { unobservedViewTargetFiles } from "../fixtures/quality-tools/unobserved-view-target";

describe("quality tools fix-prompts command", () => {
  it("prints structural fix prompts as JSON", async () => {
    const fixture = await createFixtureProject(
      "quality-tools-fix-prompts-json",
      unobservedViewTargetFiles()
    );

    try {
      const stdout = execFileSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "packages/quality-tools/src/cli.ts",
          "fix-prompts",
          "--project-path",
          fixture.root,
          "--format",
          "json",
          "--target",
          "feature-c"
        ],
        {
          cwd: path.resolve("."),
          encoding: "utf8",
          env: process.env
        }
      );
      const records = JSON.parse(stdout) as readonly [{
        readonly target_id: string;
        readonly expectation_id: string;
        readonly quality_map: string;
        readonly prompt: string;
      }];

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        target_id: "feature-c",
        expectation_id: "feature-c-runtime",
        quality_map: ".quality/evidence/feature-c/quality-map.yaml"
      });
      expect(records[0]?.prompt).toContain("Fix the evidence gap in this repo.");
    } finally {
      await fixture.cleanup();
    }
  });

  it("writes structural fix prompts as Markdown", async () => {
    const fixture = await createFixtureProject(
      "quality-tools-fix-prompts-markdown",
      unobservedViewTargetFiles()
    );

    try {
      execFileSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "packages/quality-tools/src/cli.ts",
          "fix-prompts",
          "--project-path",
          fixture.root,
          "--output",
          ".quality/fix-prompts.md",
          "--limit",
          "1"
        ],
        {
          cwd: path.resolve("."),
          encoding: "utf8",
          env: process.env
        }
      );
      const output = await readFile(path.join(fixture.root, ".quality/fix-prompts.md"), "utf8");

      expect(output).toContain("# Quality Evidence Fix Prompts");
      expect(output).toContain("```text");
      expect(output).toContain("Fix the evidence gap in this repo.");
    } finally {
      await fixture.cleanup();
    }
  });
});
