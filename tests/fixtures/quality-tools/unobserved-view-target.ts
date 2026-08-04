import type { FixtureFile } from "../quality-projects/build-fixtures";

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
    evidence:
      - id: "feature-a-runtime-source"
        type: "unit"
        path: "apps/feature-a/src/feature-a.runtime.test.ts"
        command: "pnpm vitest run tests/feature-a.test.ts"
        contexts:
          - "local"
`;
}

function featureCQualityMap(): string {
  return `target:
  id: "feature-c"
  name: "Feature C"
  scope: "feature"
expectations:
  - id: "feature-c-runtime"
    title: "Feature C runtime check passes"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P2"
    evidence:
      - id: "feature-c-runtime-source"
        type: "unit"
        path: "apps/feature-c/src/feature-c.runtime.test.ts"
        command: "pnpm vitest run tests/feature-c.test.ts"
        contexts:
          - "local"
`;
}

export function unobservedViewTargetFiles(): readonly FixtureFile[] {
  return [
    {
      relativePath: ".quality/project-map.yaml",
      contents:
        'project:\n  id: "fixture-project"\n  name: "Fixture Project"\nfeature_order:\n  - "001-feature-a"\n  - "003-feature-c"\nfeatures:\n  - id: "001-feature-a"\n    name: "Feature A"\n    artifacts:\n      quality_map_path: ".quality/evidence/feature-a/quality-map.yaml"\n  - id: "003-feature-c"\n    name: "Feature C"\n    artifacts:\n      quality_map_path: ".quality/evidence/feature-c/quality-map.yaml"\n'
    },
    {
      relativePath: ".quality/config/views.yaml",
      contents:
        'views:\n  - id: "release-scope"\n    name: "Release Scope"\n    description: "Feature A plus an unobserved feature."\n    feature_ids:\n      - "001-feature-a"\n      - "003-feature-c"\n'
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
      relativePath: ".quality/evidence/feature-c/quality-map.yaml",
      contents: featureCQualityMap()
    },
    {
      relativePath: "artifacts/runtime/quality-observations.json",
      contents: JSON.stringify({
        schema_version: 1,
        revision: { commit: "abc123" },
        observed_at: "2026-06-12T00:00:00Z",
        observations: [
          {
            path: "/tmp/repo/apps/feature-a/src/feature-a.runtime.test.ts",
            test_case: "feature a runtime passes",
            status: "pass"
          }
        ]
      })
    }
  ];
}
