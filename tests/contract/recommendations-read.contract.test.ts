import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRecommendationsOp
} from "@shiplightai/quality-core/operations";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

describe("saved recommendations read contract", () => {
  it("reads a static-only export when no observation set is selected", async () => {
    const fixture = await createFixtureProject("recommendations-read-static", [
      {
        relativePath: ".quality/generated/recommendations/static--whole-project.json",
        contents: JSON.stringify({
          schema_version: "6",
          generated_at: "2026-08-07T00:00:00.000Z",
          project_path: ".",
          project_root: "/fixture",
          scope: { kind: "whole-project", id: "whole-project", name: "Whole project" },
          structural_scores: {
            coverage_score: 80,
            evidence_confidence_score: 70,
            structure_confidence_score: 60
          },
          quality_score_availability: {
            status: "not_requested",
            reason: "No observation set was selected."
          },
          recommendations: []
        })
      }
    ]);

    try {
      const result = await getRecommendationsOp({
        projectPath: fixture.root
      });

      expect(result.path).toBe(
        path.join(fixture.root, ".quality/generated/recommendations/static--whole-project.json")
      );
      expect(result.file.observation_set_id).toBeUndefined();
      expect(result.file.runtime_review).toBeUndefined();
      expect(result.file.quality_score_availability.status).toBe("not_requested");
    } finally {
      await fixture.cleanup();
    }
  });
});
