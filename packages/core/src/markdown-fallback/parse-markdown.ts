import { readFileSync } from "node:fs";
import { canonicalSectionForHeading, displayLabelFromHeading } from "./headings";
import { createMarkdownDiagnostic } from "./diagnostics";
import type {
  FallbackCoverageRow,
  FallbackEvidenceHint,
  MarkdownArtifactSource,
  MarkdownSectionType,
  MarkdownSourceAttribution,
  ParsedMarkdownArtifact,
  ParsedMarkdownSection
} from "./types";

interface HeadingMatch {
  readonly headingText: string;
  readonly level: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly line: number;
}

const PREVIEW_LIMIT = 1_000;

function previewText(rawText: string): string {
  return rawText.length <= PREVIEW_LIMIT ? rawText : rawText.slice(0, PREVIEW_LIMIT);
}

function lineNumberFor(rawText: string, index: number): number {
  return rawText.slice(0, index).split(/\r?\n/).length;
}

function snippetFrom(rawText: string): string | undefined {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function sourceAttribution(
  source: MarkdownArtifactSource,
  headingPath: string,
  line: number | undefined,
  rawText: string
): MarkdownSourceAttribution {
  return {
    sourceClassification: "parsed_markdown_fallback",
    artifactPath: source.projectRelativePath,
    headingPath,
    ...(line === undefined ? {} : { line }),
    ...(snippetFrom(rawText) === undefined ? {} : { snippet: snippetFrom(rawText) })
  };
}

function headingMatches(rawText: string): readonly HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  const headingExpression = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  let match = headingExpression.exec(rawText);

  while (match !== null) {
    matches.push({
      level: match[1]?.length ?? 1,
      headingText: match[2]?.trim() ?? "",
      startIndex: match.index,
      endIndex: headingExpression.lastIndex,
      line: lineNumberFor(rawText, match.index)
    });
    match = headingExpression.exec(rawText);
  }

  return matches;
}

function splitCells(row: string): readonly string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(row: string): boolean {
  return splitCells(row).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function columnIndex(headers: readonly string[], names: readonly string[]): number {
  return headers.findIndex((header) => names.includes(header.toLowerCase()));
}

function parseCoverageRows(
  section: ParsedMarkdownSection
): { readonly rows: readonly FallbackCoverageRow[]; readonly malformed: boolean } {
  const tableLines = section.rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));

  if (tableLines.length === 0) {
    return { rows: [], malformed: false };
  }

  if (tableLines.length < 2 || !isSeparatorRow(tableLines[1] ?? "")) {
    return { rows: [], malformed: true };
  }

  const headers = splitCells(tableLines[0] ?? "");
  const separator = splitCells(tableLines[1] ?? "");
  if (headers.length !== separator.length) {
    return { rows: [], malformed: true };
  }

  const testingWhatIndex = columnIndex(headers, ["testing what", "behavior", "expectation"]);
  const evidenceIndex = columnIndex(headers, ["evidence"]);
  const resultIndex = columnIndex(headers, ["result", "latest result"]);
  const confidenceIndex = columnIndex(headers, ["confidence"]);
  const residualRiskIndex = columnIndex(headers, ["residual risk", "residual risks"]);

  if (
    [testingWhatIndex, evidenceIndex, resultIndex, confidenceIndex, residualRiskIndex].every(
      (index) => index === -1
    )
  ) {
    return { rows: [], malformed: true };
  }

  const rows: FallbackCoverageRow[] = [];
  for (const line of tableLines.slice(2)) {
    const cells = splitCells(line);
    if (cells.length !== headers.length) {
      return { rows: [], malformed: true };
    }

    rows.push({
      ...(testingWhatIndex === -1 ? {} : { testingWhat: cells[testingWhatIndex] }),
      ...(evidenceIndex === -1 ? {} : { evidence: cells[evidenceIndex] }),
      ...(resultIndex === -1 ? {} : { result: cells[resultIndex] }),
      ...(confidenceIndex === -1 ? {} : { confidence: cells[confidenceIndex] }),
      ...(residualRiskIndex === -1 ? {} : { residualRisk: cells[residualRiskIndex] }),
      sourceAttribution: section.sourceAttribution
    });
  }

  return { rows, malformed: false };
}

function addEvidenceHint(
  hints: FallbackEvidenceHint[],
  seen: Set<string>,
  hint: FallbackEvidenceHint
): void {
  const key = `${hint.type}:${hint.value}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  hints.push(hint);
}

function evidenceHintsFromSections(sections: readonly ParsedMarkdownSection[]): readonly FallbackEvidenceHint[] {
  const hints: FallbackEvidenceHint[] = [];
  const seen = new Set<string>();
  const commandExpression = /`([^`]*(?:pnpm|npm|yarn|vitest|playwright)[^`]*)`/g;
  const pathExpression = /`((?:apps|docs|packages|specs|\.quality|tests)\/[^`\s)]+)`/g;
  const urlExpression = /https?:\/\/[^\s)]+/g;

  for (const section of sections) {
    for (const match of section.rawText.matchAll(commandExpression)) {
      const value = match[1]?.trim();
      if (value !== undefined && value.length > 0) {
        addEvidenceHint(hints, seen, {
          type: "command",
          value,
          sourceAttribution: section.sourceAttribution
        });
      }
    }

    for (const match of section.rawText.matchAll(pathExpression)) {
      const value = match[1]?.trim();
      if (value !== undefined && value.length > 0) {
        addEvidenceHint(hints, seen, {
          type: "path",
          value,
          sourceAttribution: section.sourceAttribution
        });
      }
    }

    for (const match of section.rawText.matchAll(urlExpression)) {
      const value = match[0]?.trim();
      if (value !== undefined && value.length > 0) {
        addEvidenceHint(hints, seen, {
          type: "url",
          value,
          sourceAttribution: section.sourceAttribution
        });
      }
    }
  }

  return hints;
}

export function parseMarkdownArtifact(
  source: MarkdownArtifactSource,
  expectedSections: readonly MarkdownSectionType[]
): ParsedMarkdownArtifact {
  let rawText = "";

  try {
    rawText = readFileSync(source.resolvedLocalPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read Markdown artifact.";
    return {
      source,
      status: "invalid",
      sections: [],
      coverageRows: [],
      evidenceHints: [],
      findings: [],
      residualRisks: [],
      diagnostics: [
        createMarkdownDiagnostic({
          source,
          severity: "error",
          code: "UNREADABLE_MARKDOWN_ARTIFACT",
          message
        })
      ]
    };
  }

  if (rawText.trim().length === 0) {
    return {
      source,
      status: "empty",
      sections: [],
      coverageRows: [],
      evidenceHints: [],
      findings: [],
      residualRisks: [],
      diagnostics: [
        createMarkdownDiagnostic({
          source,
          severity: "info",
          code: "EMPTY_MARKDOWN_ARTIFACT",
          message: "Markdown artifact is empty."
        })
      ]
    };
  }

  const headings = headingMatches(rawText);
  const diagnostics = [];
  const sections: ParsedMarkdownSection[] = [];
  let displayLabel: string | undefined;

  if (headings[0]?.level === 1) {
    displayLabel = displayLabelFromHeading(headings[0].headingText);
  }

  const sectionHeadings = headings[0]?.level === 1 ? headings.slice(1) : headings;

  if (sectionHeadings.length === 0) {
    const section: ParsedMarkdownSection = {
      kind: "narrative",
      headingText: "Document",
      headingPath: "$.document",
      rawText,
      previewText: previewText(rawText),
      order: 0,
      sourceAttribution: sourceAttribution(source, "$.document", 1, rawText)
    };
    return {
      source,
      status: "parsed",
      displayLabel,
      sections: [section],
      coverageRows: [],
      evidenceHints: evidenceHintsFromSections([section]),
      findings: [],
      residualRisks: [],
      diagnostics: [
        createMarkdownDiagnostic({
          source,
          severity: "warning",
          code: "NO_RECOGNIZED_HEADINGS",
          message: "Markdown artifact has content but no recognized section headings.",
          headingPath: "$.document",
          snippet: snippetFrom(rawText)
        })
      ]
    };
  }

  const seenRecognizedHeadings = new Set<MarkdownSectionType>();
  sectionHeadings.forEach((heading, index) => {
    const nextHeading = sectionHeadings[index + 1];
    const rawSection = rawText.slice(heading.endIndex, nextHeading?.startIndex ?? rawText.length).trim();
    const headingPath = `$.sections[${index}]`;
    const canonicalSectionType = canonicalSectionForHeading(heading.headingText);
    const section: ParsedMarkdownSection = {
      kind: canonicalSectionType === undefined ? "narrative" : "recognized",
      headingText: heading.headingText,
      headingPath,
      ...(canonicalSectionType === undefined ? {} : { canonicalSectionType }),
      rawText: rawSection,
      previewText: previewText(rawSection),
      order: index,
      sourceAttribution: sourceAttribution(source, headingPath, heading.line, heading.headingText)
    };

    if (canonicalSectionType !== undefined) {
      if (seenRecognizedHeadings.has(canonicalSectionType)) {
        diagnostics.push(
          createMarkdownDiagnostic({
            source,
            severity: "warning",
            code: "DUPLICATE_MARKDOWN_HEADING",
            message: `Duplicate recognized Markdown heading '${heading.headingText}' was preserved in source order.`,
            headingPath,
            snippet: heading.headingText
          })
        );
      }
      seenRecognizedHeadings.add(canonicalSectionType);
    }

    sections.push(section);
  });

  if (seenRecognizedHeadings.size === 0) {
    diagnostics.push(
      createMarkdownDiagnostic({
        source,
        severity: "warning",
        code: "NO_RECOGNIZED_HEADINGS",
        message: "Markdown artifact has no recognized headings; content was preserved as narrative.",
        headingPath: "$.sections",
        snippet: headings[0]?.headingText
      })
    );
  }

  for (const expectedSection of expectedSections) {
    if (!seenRecognizedHeadings.has(expectedSection)) {
      diagnostics.push(
        createMarkdownDiagnostic({
          source,
          severity: "warning",
          code: "MISSING_MARKDOWN_SECTION",
          message: `Expected Markdown section '${expectedSection}' was not found.`,
          headingPath: "$.sections"
        })
      );
    }
  }

  const coverageRows: FallbackCoverageRow[] = [];
  for (const section of sections) {
    if (section.canonicalSectionType !== "coverage_matrix") {
      continue;
    }

    const parsedTable = parseCoverageRows(section);
    if (parsedTable.malformed) {
      diagnostics.push(
        createMarkdownDiagnostic({
          source,
          severity: "warning",
          code: "MALFORMED_MARKDOWN_TABLE",
          message: "Coverage Matrix table could not be normalized; raw section text was preserved.",
          headingPath: section.headingPath,
          snippet: section.headingText
        })
      );
    }
    coverageRows.push(...parsedTable.rows);
  }

  const evidenceHints = evidenceHintsFromSections(sections);

  return {
    source,
    status: "parsed",
    displayLabel,
    sections,
    coverageRows,
    evidenceHints,
    findings: sections.filter((section) => section.canonicalSectionType === "findings"),
    residualRisks: sections.filter((section) => section.canonicalSectionType === "deferred_residual_risk"),
    diagnostics
  };
}
