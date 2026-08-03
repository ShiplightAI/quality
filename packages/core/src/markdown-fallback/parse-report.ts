import { EXPECTED_REPORT_SECTIONS } from "./headings";
import { parseMarkdownArtifact } from "./parse-markdown";
import type { MarkdownArtifactSource, ParsedMarkdownArtifact } from "./types";

export function parseTestReportMarkdown(source: MarkdownArtifactSource): ParsedMarkdownArtifact {
  return parseMarkdownArtifact(source, EXPECTED_REPORT_SECTIONS);
}
