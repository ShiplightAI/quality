import { describe, expect, it } from "vitest";
import {
  KEY_ARTIFACT_ROLE_LABELS,
  keyArtifactRank,
  keyArtifactRole,
  type KeyArtifactRole
} from "@shiplightai/quality-core";

describe("keyArtifactRole", () => {
  it("classifies the feature spec, PRD, README, roadmap, test spec, and test report as key artifacts", () => {
    expect(keyArtifactRole({ label: "Feature spec", pathOrUrl: "specs/009-modern/spec.md" })).toBe("spec");
    expect(keyArtifactRole({ label: "Project spec", pathOrUrl: ".quality/project-map.yaml" })).toBe("spec");
    expect(keyArtifactRole({ label: "product_requirements", pathOrUrl: "docs/prd.md" })).toBe("prd");
    expect(keyArtifactRole({ label: "prd", pathOrUrl: "docs/requirements.md" })).toBe("prd");
    expect(keyArtifactRole({ label: "Overview", pathOrUrl: "README.md" })).toBe("readme");
    expect(keyArtifactRole({ label: "roadmap", pathOrUrl: "docs/feature-breakdown.md" })).toBe("roadmap");
    expect(keyArtifactRole({ label: "Test spec", pathOrUrl: "specs/009/test-spec.md" })).toBe("test_spec");
    expect(keyArtifactRole({ label: "test_spec", pathOrUrl: "specs/009/test-spec.md" })).toBe("test_spec");
    expect(keyArtifactRole({ label: "Test report", pathOrUrl: "specs/009/test-report.md" })).toBe("test_report");
    expect(keyArtifactRole({ label: "test_report", pathOrUrl: "specs/009/test-report.md" })).toBe("test_report");
  });

  it("treats plans, tasks, quality maps, and other context as supporting", () => {
    expect(keyArtifactRole({ label: "Feature plan", pathOrUrl: "specs/009/plan.md" })).toBeUndefined();
    expect(keyArtifactRole({ label: "Feature tasks", pathOrUrl: "specs/009/tasks.md" })).toBeUndefined();
    expect(keyArtifactRole({ label: "Quality map", pathOrUrl: ".quality/evidence/009/quality-map.yaml" })).toBeUndefined();
    expect(keyArtifactRole({ label: "Checklist", pathOrUrl: "specs/009/checklists/ux.md" })).toBeUndefined();
    expect(keyArtifactRole({ label: "Project structure", pathOrUrl: ".quality/project-map.yaml" })).toBeUndefined();
    expect(keyArtifactRole({ label: "Testing strategy", pathOrUrl: "TESTING.md" })).toBeUndefined();
    expect(keyArtifactRole({ label: "data-model", pathOrUrl: "specs/009/data-model.md" })).toBeUndefined();
  });

  it("classifies the test spec as its own role distinct from the feature spec", () => {
    expect(keyArtifactRole({ label: "Test spec", pathOrUrl: "specs/009/test-spec.md" })).toBe("test_spec");
    expect(keyArtifactRole({ label: "Feature spec", pathOrUrl: "specs/009/spec.md" })).toBe("spec");
  });

  it("ranks PRD and spec ahead of README, roadmap, test spec, and the test report", () => {
    const roles: readonly KeyArtifactRole[] = ["test_report", "roadmap", "spec", "test_spec", "readme", "prd"];
    const ordered = [...roles].sort((left, right) => keyArtifactRank(left) - keyArtifactRank(right));
    expect(ordered).toEqual(["prd", "spec", "readme", "roadmap", "test_spec", "test_report"]);
  });

  it("exposes a reviewer-facing label for every role", () => {
    expect(KEY_ARTIFACT_ROLE_LABELS.spec).toBe("Spec");
    expect(KEY_ARTIFACT_ROLE_LABELS.test_report).toBe("Test report");
  });
});
