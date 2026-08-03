import { generateFixPrompts } from "@shiplightai/quality-core";
import { describe, expect, it } from "vitest";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

// Regression: fix-prompts used a hand-rolled YAML reader that rejected valid
// double-quoted line-continuations (a "\" fold at end of line), throwing
// "Unsupported YAML line N". Real quality maps wrap long evidence paths this way.
// The failure surfaced as a hard error for the fix-prompts command and, inside
// analyze (which swallows the throw), as silently dropped canonical prompts.
// fix-prompts now shares the same `yaml` parser as the scan/analyze path.
const FOLDED_PATH =
  "packages/sdk-core/src/agent/action-generation/coordinatesBased/__tests__/openaiActionShape.test.ts";

function foldedPathQualityMap(): string {
  return `structure_provenance: "user_authored"
target:
  id: "feature-fold"
  name: "Feature Fold"
  scope: "feature"
expectations:
  - id: "feature-fold-proof"
    title: "Folded evidence path parses"
    source_type: "IMPLEMENTATION"
    category: "runtime"
    priority: "P1"
    evidence:
      - id: "feature-fold-source"
        type: "unit"
        path: "packages/sdk-core/src/agent/action-generation/coordinatesBased/__tests__\\
          /openaiActionShape.test.ts"
        contexts:
          - "local"
`;
}

describe("fix-prompts YAML line-continuation", () => {
  it("parses a quality map with a double-quoted folded evidence path", async () => {
    const fixture = await createFixtureProject("fix-prompts-yaml-continuation", [
      {
        relativePath: ".quality/evidence/feature-fold/quality-map.yaml",
        contents: foldedPathQualityMap()
      }
    ]);

    try {
      // Pre-fix this threw "Unsupported YAML line ...". It must not.
      const result = generateFixPrompts({
        repo: fixture.root,
        format: "json",
        includeCovered: true
      });

      const record = result.records.find((entry) => entry.expectation_id === "feature-fold-proof");
      expect(record).toBeDefined();

      // The fold must be joined into a single clean path, with no backslash,
      // newline, or indentation artifact leaking through.
      const serialized = JSON.stringify(result.records);
      expect(serialized).toContain(FOLDED_PATH);
      expect(serialized).not.toContain("__tests__\\");
      expect(record?.prompt).not.toContain("\\\n");
    } finally {
      await fixture.cleanup();
    }
  });
});
