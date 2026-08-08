import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, realpath } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { unobservedViewTargetFiles } from "../fixtures/quality-tools/unobserved-view-target";

describe("quality tools analyze command", () => {
  it("writes saved-view recommendations with unobserved scoped targets", async () => {
    const fixture = await createFixtureProject(
      "quality-tools-analyze-unobserved-view-target",
      unobservedViewTargetFiles()
    );

    try {
      const stdout = execFileSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "packages/quality-tools/src/cli.ts",
          "analyze",
          "--project-path",
          fixture.root,
          "--observation-set",
          "runtime-review",
          "--view",
          "release-scope"
        ],
        {
          cwd: path.resolve("."),
          encoding: "utf8",
          env: process.env
        }
      ).trim();
      const outputPath = path.join(
        fixture.root,
        ".quality/generated/recommendations/runtime-review--release-scope.json"
      );
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        readonly runtime_review: {
          readonly evaluated_target_count: number;
          readonly evaluated_expectation_count: number;
          readonly quality_score?: number;
        };
        readonly recommendations: readonly [{
          readonly target_id: string;
          readonly expectation_local_id: string;
          readonly observed_state: string;
        }];
      };

      expect(stdout).toBe(outputPath);
      expect(payload.runtime_review).toMatchObject({
        evaluated_target_count: 2,
        evaluated_expectation_count: 3,
        quality_score: 38
      });
      expect(payload.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            target_id: ".quality/evidence/feature-c/quality-map.yaml#target:feature-c",
            expectation_local_id: "feature-c-runtime",
            observed_state: "unobserved"
          })
        ])
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports the static scores when no observation set is given", async () => {
    // Regression: analyze used to reject the command outright without
    // --observation-set, hiding the three scores that need no runtime data.
    const fixture = await createFixtureProject(
      "quality-tools-analyze-no-observation-set",
      unobservedViewTargetFiles()
    );

    try {
      const stdout = execFileSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "packages/quality-tools/src/cli.ts",
          "analyze",
          "--project-path",
          fixture.root
        ],
        {
          cwd: path.resolve("."),
          encoding: "utf8",
          env: process.env
        }
      ).trim();
      const outputPath = path.join(
        fixture.root,
        ".quality/generated/recommendations/static--whole-project.json"
      );
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        readonly schema_version: string;
        readonly observation_set_id?: string;
        readonly runtime_review?: unknown;
        readonly quality_score_availability: {
          readonly status: string;
          readonly reason?: string;
        };
        readonly structural_scores?: {
          readonly coverage_score?: number;
          readonly evidence_confidence_score?: number;
          readonly structure_confidence_score?: number;
        };
      };

      expect(stdout).toBe(outputPath);
      expect(payload.schema_version).toBe("6");
      expect(payload.observation_set_id).toBeUndefined();
      expect(payload.runtime_review).toBeUndefined();
      expect(payload.quality_score_availability.status).toBe("not_requested");
      expect(typeof payload.structural_scores?.coverage_score).toBe("number");
      expect(typeof payload.structural_scores?.evidence_confidence_score).toBe("number");
      expect(typeof payload.structural_scores?.structure_confidence_score).toBe("number");
    } finally {
      await fixture.cleanup();
    }
  });

  it("writes recommendations to an explicit output path", async () => {
    const fixture = await createFixtureProject(
      "quality-tools-analyze-explicit-output",
      unobservedViewTargetFiles()
    );

    try {
      const stdout = execFileSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "packages/quality-tools/src/cli.ts",
          "analyze",
          "--project-path",
          fixture.root,
          "--observation-set",
          "runtime-review",
          "--view",
          "release-scope",
          "--output",
          "custom/recommendations.json"
        ],
        {
          cwd: path.resolve("."),
          encoding: "utf8",
          env: process.env
        }
      ).trim();
      const outputPath = path.join(fixture.root, "custom/recommendations.json");
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        readonly schema_version: string;
        readonly observation_set_id: string;
        readonly scope: {
          readonly id: string;
        };
      };

      expect(stdout).toBe(outputPath);
      expect(payload).toMatchObject({
        schema_version: "6",
        observation_set_id: "runtime-review",
        scope: {
          id: "release-scope"
        }
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("runs the built CLI from a target workspace without a source command runner", async () => {
    execFileSync(
      "pnpm",
      ["--filter", "@shiplightai/quality-tools", "build"],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: process.env
      }
    );
    const packageExports = await import(pathToFileURL(path.resolve("packages/quality-tools/dist/index.js")).href) as {
      readonly buildRecommendationExport?: unknown;
      readonly generateFixPrompts?: unknown;
    };
    expect(typeof packageExports.buildRecommendationExport).toBe("function");
    expect(typeof packageExports.generateFixPrompts).toBe("function");

    const fixture = await createFixtureProject(
      "quality-tools-analyze-built-cli",
      unobservedViewTargetFiles()
    );

    try {
      const stdout = execFileSync(
        "node",
        [
          path.resolve("packages/quality-tools/dist/cli.js"),
          "analyze",
          "--project-path",
          ".",
          "--observation-set",
          "runtime-review",
          "--view",
          "release-scope"
        ],
        {
          cwd: fixture.root,
          encoding: "utf8",
          env: process.env
        }
      ).trim();
      const outputPath = path.join(
        await realpath(fixture.root),
        ".quality/generated/recommendations/runtime-review--release-scope.json"
      );
      const payload = JSON.parse(await readFile(outputPath, "utf8")) as {
        readonly scope: {
          readonly id: string;
        };
        readonly runtime_review: {
          readonly evaluated_target_count: number;
        };
      };

      expect(stdout).toBe(outputPath);
      expect(payload.scope.id).toBe("release-scope");
      expect(payload.runtime_review.evaluated_target_count).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });
});
