import type { QualityMapParseBatch } from "@shiplightai/quality-map";

export type MarkdownArtifactType = "test_spec" | "test_report";

export type MarkdownFallbackClassification = "parsed_markdown_fallback";

export type MarkdownDiagnosticSeverity = "error" | "warning" | "info";

export type ParsedMarkdownArtifactStatus = "parsed" | "empty" | "invalid";

export type ParsedMarkdownSectionKind = "recognized" | "narrative";

export type MarkdownSectionType =
  | "testing_what"
  | "evidence_strategy"
  | "test_cases"
  | "fixtures_and_environments"
  | "report_expectations"
  | "coverage_notes"
  | "summary"
  | "source_material"
  | "commands_run"
  | "tests_added_or_updated"
  | "coverage_matrix"
  | "agent_test_evidence"
  | "manual_verification_log"
  | "findings"
  | "deferred_residual_risk"
  | "cleanup"
  | "coverage_summary";

export interface MarkdownArtifactSource {
  readonly artifactType: MarkdownArtifactType;
  readonly projectRelativePath: string;
  readonly resolvedLocalPath: string;
  readonly targetCandidateId?: string;
  readonly sourcePattern?: string;
}

export interface MarkdownSourceAttribution {
  readonly sourceClassification: MarkdownFallbackClassification;
  readonly artifactPath: string;
  readonly headingPath: string;
  readonly line?: number;
  readonly snippet?: string;
}

export interface MarkdownDiagnostic {
  readonly severity: MarkdownDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly artifactPath: string;
  readonly headingPath?: string;
  readonly snippet?: string;
}

export interface ParsedMarkdownSection {
  readonly kind: ParsedMarkdownSectionKind;
  readonly headingText: string;
  readonly headingPath: string;
  readonly canonicalSectionType?: MarkdownSectionType;
  readonly rawText: string;
  readonly previewText: string;
  readonly order: number;
  readonly sourceAttribution: MarkdownSourceAttribution;
}

export interface FallbackCoverageRow {
  readonly testingWhat?: string;
  readonly evidence?: string;
  readonly result?: string;
  readonly confidence?: string;
  readonly residualRisk?: string;
  readonly sourceAttribution: MarkdownSourceAttribution;
}

export type FallbackEvidenceHintType = "command" | "path" | "url";

export interface FallbackEvidenceHint {
  readonly value: string;
  readonly label?: string;
  readonly type: FallbackEvidenceHintType;
  readonly sourceAttribution: MarkdownSourceAttribution;
}

export interface ParsedMarkdownArtifact {
  readonly source: MarkdownArtifactSource;
  readonly status: ParsedMarkdownArtifactStatus;
  readonly displayLabel?: string;
  readonly sections: readonly ParsedMarkdownSection[];
  readonly coverageRows: readonly FallbackCoverageRow[];
  readonly evidenceHints: readonly FallbackEvidenceHint[];
  readonly findings: readonly ParsedMarkdownSection[];
  readonly residualRisks: readonly ParsedMarkdownSection[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export interface FallbackTarget {
  readonly targetIdentity: string;
  readonly displayLabel: string;
  readonly sourceClassification: MarkdownFallbackClassification;
  readonly sourceArtifacts: readonly MarkdownArtifactSource[];
  readonly sections: readonly ParsedMarkdownSection[];
  readonly coverageRows: readonly FallbackCoverageRow[];
  readonly evidenceHints: readonly FallbackEvidenceHint[];
  readonly findings: readonly ParsedMarkdownSection[];
  readonly residualRisks: readonly ParsedMarkdownSection[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export interface SupplementalMarkdownNarrative {
  readonly targetIdentity: string;
  readonly sourceClassification: MarkdownFallbackClassification;
  readonly sourceArtifacts: readonly MarkdownArtifactSource[];
  readonly sections: readonly ParsedMarkdownSection[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export interface BuildMarkdownFallbackInput {
  readonly sources: readonly MarkdownArtifactSource[];
  readonly qualityMaps?: QualityMapParseBatch;
}

export interface MarkdownFallbackBatch {
  readonly fallbackTargets: readonly FallbackTarget[];
  readonly supplementalNarratives: readonly SupplementalMarkdownNarrative[];
  readonly parsedArtifacts: readonly ParsedMarkdownArtifact[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}
