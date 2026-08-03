import type { MarkdownArtifactType, MarkdownSectionType } from "./types";

export const MARKDOWN_FALLBACK_SOURCE_CLASSIFICATION = "parsed_markdown_fallback" as const;

const HEADING_ALIASES = new Map<string, MarkdownSectionType>([
  ["testing what", "testing_what"],
  ["what to test", "testing_what"],
  ["evidence strategy", "evidence_strategy"],
  ["test cases", "test_cases"],
  ["test inventory", "test_cases"],
  ["fixtures and environments", "fixtures_and_environments"],
  ["fixtures environments", "fixtures_and_environments"],
  ["report expectations", "report_expectations"],
  ["coverage notes", "coverage_notes"],
  ["summary", "summary"],
  ["source material", "source_material"],
  ["commands run", "commands_run"],
  ["tests added or updated", "tests_added_or_updated"],
  ["coverage matrix", "coverage_matrix"],
  ["agent test evidence", "agent_test_evidence"],
  ["manual verification log", "manual_verification_log"],
  ["findings", "findings"],
  ["deferred residual risk", "deferred_residual_risk"],
  ["deferred residual risks", "deferred_residual_risk"],
  ["deferred risk", "deferred_residual_risk"],
  ["cleanup", "cleanup"],
  ["coverage summary", "coverage_summary"]
]);

export const EXPECTED_SPEC_SECTIONS: readonly MarkdownSectionType[] = [
  "testing_what",
  "evidence_strategy",
  "test_cases",
  "fixtures_and_environments",
  "report_expectations",
  "coverage_notes"
];

export const EXPECTED_REPORT_SECTIONS: readonly MarkdownSectionType[] = [
  "summary",
  "source_material",
  "commands_run",
  "tests_added_or_updated",
  "coverage_matrix",
  "agent_test_evidence",
  "manual_verification_log",
  "findings",
  "deferred_residual_risk",
  "cleanup",
  "coverage_summary"
];

export function expectedSectionsFor(
  artifactType: MarkdownArtifactType
): readonly MarkdownSectionType[] {
  return artifactType === "test_spec" ? EXPECTED_SPEC_SECTIONS : EXPECTED_REPORT_SECTIONS;
}

export function normalizeHeadingText(heading: string): string {
  return heading
    .trim()
    .replace(/^#+/, "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

export function canonicalSectionForHeading(heading: string): MarkdownSectionType | undefined {
  return HEADING_ALIASES.get(normalizeHeadingText(heading));
}

export function displayLabelFromHeading(heading: string): string {
  return heading.replace(/^Test (Spec|Report):\s*/i, "").trim();
}
