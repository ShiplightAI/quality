import type {
  QualityMapSourceAttribution
} from "@shiplightai/quality-map";
import type { MarkdownSourceAttribution } from "../markdown-fallback/types";
import type { EvidenceSourceAttribution } from "./types";

export function unavailable(value: string | undefined | null): string {
  return value === undefined || value === null || value.length === 0 ? "unavailable" : value;
}

export function structuredAttribution(
  sourceAttribution: QualityMapSourceAttribution
): EvidenceSourceAttribution {
  return {
    sourceClassification: "structured_quality_map",
    referencePath: sourceAttribution.mapPath,
    yamlPath: sourceAttribution.yamlPath,
    line: sourceAttribution.line,
    snippet: sourceAttribution.snippet
  };
}

export function markdownAttribution(
  sourceAttribution: MarkdownSourceAttribution
): EvidenceSourceAttribution {
  return {
    sourceClassification: "parsed_markdown_fallback",
    referencePath: sourceAttribution.artifactPath,
    headingPath: sourceAttribution.headingPath,
    line: sourceAttribution.line,
    snippet: sourceAttribution.snippet
  };
}
