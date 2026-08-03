import { EXPECTED_SPEC_SECTIONS } from "./headings";
import { parseMarkdownArtifact } from "./parse-markdown";
import type { MarkdownArtifactSource, ParsedMarkdownArtifact } from "./types";

export function parseTestSpecMarkdown(source: MarkdownArtifactSource): ParsedMarkdownArtifact {
  return parseMarkdownArtifact(source, EXPECTED_SPEC_SECTIONS);
}
