import type {
  MarkdownArtifactSource,
  MarkdownDiagnostic,
  MarkdownDiagnosticSeverity
} from "./types";

export function createMarkdownDiagnostic(input: {
  readonly source: MarkdownArtifactSource;
  readonly severity: MarkdownDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly headingPath?: string;
  readonly snippet?: string;
}): MarkdownDiagnostic {
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    artifactPath: input.source.projectRelativePath,
    ...(input.headingPath === undefined ? {} : { headingPath: input.headingPath }),
    ...(input.snippet === undefined ? {} : { snippet: input.snippet })
  };
}
