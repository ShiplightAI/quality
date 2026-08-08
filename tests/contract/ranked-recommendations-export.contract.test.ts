import path from "node:path";
import {
  buildRecommendationExport,
  generateFixPrompts,
  type RecommendationFixPromptRecord
} from "@shiplightai/quality-core";
import { describe, expect, it } from "vitest";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { unobservedViewTargetFiles } from "../fixtures/quality-tools/unobserved-view-target";

function featureAQualityMap(): string {
  return `target:
  id: "feature-a"
  name: "Feature A"
  scope: "feature"
expectations:
  - id: "feature-a-proof"
    title: "Feature A proof exists"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    risk:
      weight: 3
      rationale: "This proof should be present in the runtime recommendation queue."
    evidence:
      - id: "feature-a-proof-source"
        type: "unit"
        path: "apps/feature-a/src/feature-a.proof.test.ts"
        command: "pnpm vitest run tests/feature-a.test.ts"
        contexts:
          - "local"
  - id: "feature-a-runtime"
    title: "Feature A runtime check passes"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    risk:
      weight: 3
      rationale: "This passing check keeps the target in the evaluated runtime set."
    evidence:
      - id: "feature-a-runtime-source"
        type: "unit"
        path: "apps/feature-a/src/feature-a.runtime.test.ts"
        command: "pnpm vitest run tests/feature-a.test.ts"
        contexts:
          - "local"
`;
}

function featureBQualityMap(): string {
  return `target:
  id: "feature-b"
  name: "Feature B"
  scope: "feature"
expectations:
  - id: "feature-b-runtime"
    title: "Feature B runtime check passes"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P2"
    risk:
      weight: 2
      rationale: "Secondary proof should not outrank Feature A."
    evidence:
      - id: "feature-b-runtime-source"
        type: "unit"
        path: "apps/feature-b/src/feature-b.runtime.test.ts"
        command: "pnpm vitest run tests/feature-b.test.ts"
        contexts:
          - "local"
`;
}

function runtimeJunitFixture(): string {
  return JSON.stringify({
    schema_version: 1,
    revision: { commit: "abc123" },
    observed_at: "2026-06-12T00:00:00Z",
    observations: [
      {
        path: "/tmp/repo/apps/feature-a/src/feature-a.runtime.test.ts",
        test_case: "feature a runtime passes",
        status: "pass"
      },
      {
        path: "/tmp/repo/apps/feature-b/src/feature-b.runtime.test.ts",
        test_case: "feature b runtime passes",
        status: "pass"
      }
    ]
  });
}

function fixPromptRecords(repo: string): readonly RecommendationFixPromptRecord[] {
  return generateFixPrompts({
    repo,
    format: "json",
    includeCovered: true
  }).records.map((record) => ({
    expectation_id: record.expectation_id,
    prompt: record.prompt,
    quality_map: record.quality_map
  }));
}

describe("ranked recommendations export", () => {
  it("builds a deterministic recommendation export for a saved observation set and view", async () => {
    const fixture = await createFixtureProject("ranked-recommendations-export", [
      {
        relativePath: ".quality/project-map.yaml",
        contents:
          'project:\n  id: "fixture-project"\n  name: "Fixture Project"\nfeature_order:\n  - "001-feature-a"\n  - "002-feature-b"\nfeatures:\n  - id: "001-feature-a"\n    name: "Feature A"\n    artifacts:\n      quality_map_path: ".quality/evidence/feature-a/quality-map.yaml"\n  - id: "002-feature-b"\n    name: "Feature B"\n    artifacts:\n      quality_map_path: ".quality/evidence/feature-b/quality-map.yaml"\n'
      },
      {
        relativePath: ".quality/config/views.yaml",
        contents:
          'views:\n  - id: "feature-a"\n    name: "Feature A View"\n    description: "Feature A only."\n    feature_ids:\n      - "001-feature-a"\n'
      },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-runtime"
    name: "Local Runtime"
    transport: "local-folder"
    observation_path: "quality-observations.json"
    local_folder:
      path: "artifacts/runtime"
`
      },
      {
        relativePath: ".quality/config/observation-sets.yaml",
        contents: `observation_sets:
  - id: "runtime-review"
    name: "Observation Set"
    profiles:
      - profile_id: "local-runtime"
`
      },
      {
        relativePath: ".quality/evidence/feature-a/quality-map.yaml",
        contents: featureAQualityMap()
      },
      {
        relativePath: ".quality/evidence/feature-b/quality-map.yaml",
        contents: featureBQualityMap()
      },
      {
        relativePath: "artifacts/runtime/quality-observations.json",
        contents: runtimeJunitFixture()
      }
    ]);

    try {
      const output = await buildRecommendationExport({
        projectPath: fixture.root,
        observationSetId: "runtime-review",
        viewId: "feature-a",
        fixPromptRecords: fixPromptRecords(fixture.root),
        generatedAt: new Date("2026-06-12T00:00:00.000Z")
      });

      expect(output.outputPath).toBe(
        path.join(fixture.root, ".quality/generated/recommendations/runtime-review--feature-a.json")
      );
      expect(output.file).toMatchObject({
        schema_version: "6",
        generated_at: "2026-06-12T00:00:00.000Z",
        observation_set_id: "runtime-review",
        quality_score_availability: { status: "available" },
        scope: {
          kind: "view",
          id: "feature-a",
          name: "Feature A View",
          description: "Feature A only."
        },
        runtime_review: {
          execution_status: "valid",
          resolution_status: "valid",
          quality_score: 50,
          evaluated_target_count: 1,
          evaluated_expectation_count: 2
        }
      });
      expect(output.file.runtime_review?.profiles).toContainEqual(
        expect.objectContaining({
          profile_id: "local-runtime",
          transport: "local-folder"
        })
      );
      expect(output.file.recommendations).toHaveLength(1);
      expect(output.file.recommendations[0]).toMatchObject({
        rank: 1,
        target_id: ".quality/evidence/feature-a/quality-map.yaml#target:feature-a",
        expectation_local_id: "feature-a-proof",
        quality_map_path: ".quality/evidence/feature-a/quality-map.yaml",
        score_lift: 50,
        current_score: 50,
        projected_score: 100,
        prompt_source: "canonical",
        prompt: expect.stringContaining("Feature A proof exists")
      });
      // Static structural scores accompany the runtime review on a successful run.
      // feature-a declares no structure_provenance, so structure confidence is the
      // unspecified floor (0 / UNSPECIFIED) even though coverage is complete.
      expect(output.file.structural_scores).toMatchObject({
        coverage_score: 100,
        structure_confidence_score: 0,
        structure_confidence_label: "UNSPECIFIED"
      });
      expect(typeof output.file.structural_scores?.evidence_confidence_score).toBe("number");
      expect(typeof output.file.structural_scores?.basis).toBe("string");
    } finally {
      await fixture.cleanup();
    }
  });

  it("still reports static structural scores when runtime acquisition fails", async () => {
    // A GitHub Actions source whose required token is absent: acquisition fails,
    // so runtime_review carries no observation-backed quality_score. The static
    // structural scores (coverage + both confidence axes) must still be emitted,
    // since they derive from the scanned maps alone and need no observations.
    const fixture = await createFixtureProject("ranked-recommendations-export-runtime-unavailable", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "publish-workflow"
    name: "Publish Workflow"
    transport: "github-actions"
    observation_path: "quality-observations.json"
    auth:
      required_env: ["GITHUB_TOKEN"]
    github:
      repo: "org/repo"
      workflow: "publish.yml"
      artifact_names: ["qc-observations-*"]
`
      },
      {
        relativePath: ".quality/config/observation-sets.yaml",
        contents: `observation_sets:
  - id: "runtime-review"
    name: "Observation Set"
    profiles:
      - profile_id: "publish-workflow"
`
      },
      {
        relativePath: ".quality/evidence/feature-a/quality-map.yaml",
        contents: `structure_provenance: "user_authored"
target:
  id: "feature-a"
  name: "Feature A"
  scope: "feature"
expectations:
  - id: "feature-a-proof"
    title: "Feature A proof exists"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    evidence:
      - id: "feature-a-proof-source"
        type: "unit"
        path: "apps/feature-a/src/feature-a.proof.test.ts"
        contexts:
          - "local"
  - id: "feature-a-runtime"
    title: "Feature A runtime check passes"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    evidence:
      - id: "feature-a-runtime-source"
        type: "unit"
        path: "apps/feature-a/src/feature-a.runtime.test.ts"
        contexts:
          - "local"
`
      }
    ]);

    try {
      const output = await buildRecommendationExport({
        projectPath: fixture.root,
        observationSetId: "runtime-review",
        // Force the missing-token failure deterministically, independent of the
        // ambient shell environment.
        env: {},
        generatedAt: new Date("2026-06-12T00:00:00.000Z")
      });

      // Runtime acquisition failed -> no observation-backed quality score, and the
      // export says why rather than leaving the gap unexplained.
      expect(output.file.runtime_review?.execution_status).toBe("invalid");
      expect(output.file.runtime_review?.quality_score).toBeUndefined();
      expect(output.file.quality_score_availability.status).toBe("unavailable");
      expect(output.file.quality_score_availability.reason).toEqual(
        expect.stringContaining("could not be acquired")
      );

      // ...but the static structural scores are fully present.
      expect(output.file.structural_scores).toMatchObject({
        coverage_score: 100,
        evidence_confidence_score: 70,
        structure_confidence_score: 100,
        quality_score_static: 100,
        evidence_confidence_label: "MEDIUM",
        structure_confidence_label: "HIGH",
        total_check_count: 2
      });
      expect(typeof output.file.structural_scores?.basis).toBe("string");
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports the static scores without an observation set", async () => {
    // The three static scores come from the graph alone, so an export must be
    // producible with no observation set at all. Only the runtime Quality score
    // depends on observations, and its absence has to be explained.
    const fixture = await createFixtureProject("ranked-recommendations-export-static-only", [
      {
        relativePath: ".quality/evidence/feature-a/quality-map.yaml",
        contents: `structure_provenance: "user_authored"
target:
  id: "feature-a"
  name: "Feature A"
  scope: "feature"
expectations:
  - id: "feature-a-proof"
    title: "Feature A proof exists"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    evidence:
      - id: "feature-a-proof-source"
        type: "unit"
        path: "apps/feature-a/src/feature-a.proof.test.ts"
        contexts:
          - "local"
  - id: "feature-a-runtime"
    title: "Feature A runtime check passes"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    evidence:
      - id: "feature-a-runtime-source"
        type: "unit"
        path: "apps/feature-a/src/feature-a.runtime.test.ts"
        contexts:
          - "local"
`
      }
    ]);

    try {
      const output = await buildRecommendationExport({
        projectPath: fixture.root,
        generatedAt: new Date("2026-06-12T00:00:00.000Z")
      });

      // A static-only export writes under its own reserved prefix, so it can never
      // overwrite an observation set's export for the same scope.
      expect(output.outputPath).toBe(
        path.join(fixture.root, ".quality/generated/recommendations/static--whole-project.json")
      );
      expect(output.file.schema_version).toBe("6");
      expect(output.file.observation_set_id).toBeUndefined();
      expect(output.file.observation_set_name).toBeUndefined();
      // No observation set was selected, so there was no runtime review at all.
      expect(output.file.runtime_review).toBeUndefined();
      expect(output.file.quality_score_availability.status).toBe("not_requested");
      expect(output.file.quality_score_availability.reason).toEqual(
        expect.stringContaining("No observation set was selected")
      );

      // The three graph-derived scores are reported in full.
      expect(output.file.structural_scores).toMatchObject({
        coverage_score: 100,
        evidence_confidence_score: 70,
        structure_confidence_score: 100,
        evidence_confidence_label: "MEDIUM",
        structure_confidence_label: "HIGH",
        total_check_count: 2
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it.each(["static", "STATIC", "Static"])(
    "rejects the reserved observation-set id %s in the export write path",
    async (observationSetId) => {
      const fixture = await createFixtureProject("ranked-recommendations-reserved-static", []);

      try {
        await expect(
          buildRecommendationExport({
            projectPath: fixture.root,
            observationSetId
          })
        ).rejects.toThrow("reserved for static-only assessments");
      } finally {
        await fixture.cleanup();
      }
    }
  );

  it("scopes the static-only export to a saved view", async () => {
    const fixture = await createFixtureProject(
      "ranked-recommendations-export-static-only-view",
      unobservedViewTargetFiles()
    );

    try {
      const output = await buildRecommendationExport({
        projectPath: fixture.root,
        viewId: "release-scope",
        generatedAt: new Date("2026-06-12T00:00:00.000Z")
      });

      expect(output.outputPath).toBe(
        path.join(fixture.root, ".quality/generated/recommendations/static--release-scope.json")
      );
      expect(output.file.scope).toMatchObject({ kind: "view", id: "release-scope" });
      expect(output.file.quality_score_availability.status).toBe("not_requested");
      expect(typeof output.file.structural_scores?.coverage_score).toBe("number");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an unknown observation set instead of falling back to static scores", async () => {
    // Asking for runtime data that does not exist is still an error: only omitting
    // --observation-set entirely selects the static-only export.
    const fixture = await createFixtureProject(
      "ranked-recommendations-export-unknown-set",
      unobservedViewTargetFiles()
    );

    try {
      await expect(
        buildRecommendationExport({
          projectPath: fixture.root,
          observationSetId: "missing-set"
        })
      ).rejects.toThrow("Observation set not found: missing-set");
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps saved-view targets in recommendations when they have no matching observations", async () => {
    const fixture = await createFixtureProject(
      "ranked-recommendations-export-unobserved-view-target",
      unobservedViewTargetFiles()
    );

    try {
      const output = await buildRecommendationExport({
        projectPath: fixture.root,
        observationSetId: "runtime-review",
        viewId: "release-scope",
        fixPromptRecords: fixPromptRecords(fixture.root),
        generatedAt: new Date("2026-06-12T00:00:00.000Z")
      });

      expect(output.outputPath).toBe(
        path.join(fixture.root, ".quality/generated/recommendations/runtime-review--release-scope.json")
      );
      expect(output.file.runtime_review).toMatchObject({
        quality_score: 38,
        evaluated_target_count: 2,
        evaluated_expectation_count: 3
      });
      expect(output.file.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            target_id: ".quality/evidence/feature-c/quality-map.yaml#target:feature-c",
            expectation_local_id: "feature-c-runtime",
            observed_state: "unobserved",
            quality_map_path: ".quality/evidence/feature-c/quality-map.yaml"
          })
        ])
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("exports resolution audit examples when loaded observations do not match evidence paths", async () => {
    const fixture = await createFixtureProject("ranked-recommendations-export-resolution-audit", [
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-runtime"
    name: "Local Runtime"
    transport: "local-folder"
    observation_path: "quality-observations.json"
    local_folder:
      path: "artifacts/runtime"
`
      },
      {
        relativePath: ".quality/config/observation-sets.yaml",
        contents: `observation_sets:
  - id: "runtime-review"
    name: "Observation Set"
    profiles:
      - profile_id: "local-runtime"
`
      },
      {
        relativePath: ".quality/evidence/feature-a/quality-map.yaml",
        contents: featureAQualityMap()
      },
      {
        relativePath: "artifacts/runtime/quality-observations.json",
        contents: JSON.stringify({
          schema_version: 1,
          revision: { commit: "abc123" },
          observed_at: "2026-06-12T00:00:00Z",
          observations: [
            {
              path: "/tmp/repo/apps/feature-a/src/unmapped.runtime.test.ts",
              test_case: "unmapped runtime passes",
              status: "pass"
            }
          ]
        })
      }
    ]);

    try {
      const output = await buildRecommendationExport({
        projectPath: fixture.root,
        observationSetId: "runtime-review",
        generatedAt: new Date("2026-06-12T00:00:00.000Z")
      });

      expect(output.file.runtime_review).toMatchObject({
        execution_status: "valid",
        resolution_status: "valid",
        observation_count: 0,
        resolution_audit: {
          matched_observation_count: 0,
          unmatched_observation_count: 1,
          ambiguous_observation_count: 0,
          unmatched_examples: [
            expect.objectContaining({
              observation_id: expect.stringContaining("unmapped runtime passes"),
              match_status: "unmatched",
              test_file: "/tmp/repo/apps/feature-a/src/unmapped.runtime.test.ts",
              test_case: "unmapped runtime passes"
            })
          ],
          ambiguous_examples: []
        }
      });
      expect(output.file.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            expectation_local_id: "feature-a-runtime",
            observed_state: "unobserved"
          })
        ])
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
