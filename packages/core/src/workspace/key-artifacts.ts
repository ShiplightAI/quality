/**
 * Key artifacts are the small set of documents a human reviewer reads first to
 * understand a project or feature and how it is verified: the spec or PRD, the
 * README, the roadmap, the test spec, and the test report. Everything else
 * (plan, tasks, data-model, quickstart, quality map, checklists, evidence, and
 * configuration files) is supporting context that stays out of the way until
 * the reviewer goes looking for it.
 *
 * Classification is intentionally label- and filename-driven so it works for
 * project-map source references, discovered artifacts, and Markdown fallbacks
 * alike, without depending on how any one source labels its files.
 */
export type KeyArtifactRole = "spec" | "prd" | "readme" | "roadmap" | "test_spec" | "test_report";

export interface KeyArtifactInput {
  readonly label?: string | undefined;
  readonly pathOrUrl?: string | undefined;
}

const KEY_ARTIFACT_RANK: Record<KeyArtifactRole, number> = {
  prd: 0,
  spec: 1,
  readme: 2,
  roadmap: 3,
  test_spec: 4,
  test_report: 5
};

/**
 * Reviewer-facing label for a key-artifact role. Kept here so the project and
 * feature panels present the same words for the same role.
 */
export const KEY_ARTIFACT_ROLE_LABELS: Record<KeyArtifactRole, string> = {
  prd: "PRD",
  spec: "Spec",
  readme: "README",
  roadmap: "Roadmap",
  test_spec: "Test spec",
  test_report: "Test report"
};

function basename(pathOrUrl: string | undefined): string {
  if (pathOrUrl === undefined) {
    return "";
  }

  const withoutQuery = pathOrUrl.split(/[?#]/)[0] ?? "";
  return withoutQuery.split(/[\\/]/).pop()?.toLowerCase() ?? "";
}

function normalizeLabel(label: string | undefined): string {
  return (label ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
}

/**
 * Returns the key-artifact role for a review artifact, or `undefined` when the
 * artifact is supporting context. `test-report.md` and `test-spec.md` are
 * resolved before the generic spec check so the test spec is classified as its
 * own role rather than being mistaken for the feature spec (its filename also
 * ends in `spec.md`).
 */
export function keyArtifactRole(input: KeyArtifactInput): KeyArtifactRole | undefined {
  const name = basename(input.pathOrUrl);
  const label = normalizeLabel(input.label);

  if (name === "test-report.md" || label.includes("test report")) {
    return "test_report";
  }

  if (name === "test-spec.md" || label === "test spec") {
    return "test_spec";
  }

  if (name === "spec.md" || label === "spec" || label === "feature spec" || label === "project spec") {
    return "spec";
  }

  if (name === "prd.md" || label.includes("prd") || label.includes("product requirement")) {
    return "prd";
  }

  if (name.startsWith("readme.") || label === "readme") {
    return "readme";
  }

  if (
    name === "roadmap.md" ||
    name === "feature-breakdown.md" ||
    label.includes("roadmap") ||
    label.includes("feature breakdown")
  ) {
    return "roadmap";
  }

  return undefined;
}

/** Sort rank for a key-artifact role; lower sorts first. */
export function keyArtifactRank(role: KeyArtifactRole): number {
  return KEY_ARTIFACT_RANK[role];
}
