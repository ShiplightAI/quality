import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { createQualityMapDiagnostic } from "./diagnostics";
import type {
  NormalizedQualityGraphResult,
  ParsedQualityMap,
  QualityMapDocument,
  QualityMapParseBatch,
  QualityMapSource
} from "./types";
import { normalizeQualityMap } from "./normalize";
import { validateQualityMap } from "./validate";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseQualityMap(source: QualityMapSource): ParsedQualityMap {
  let rawText = "";

  try {
    rawText = readFileSync(source.resolvedLocalPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read quality map.";
    return {
      source,
      status: "invalid",
      rawText,
      diagnostics: [
        createQualityMapDiagnostic(source, {
          severity: "error",
          code: "UNREADABLE_QUALITY_MAP",
          message,
          yamlPath: "$",
          rawText
        })
      ]
    };
  }

  const document = parseDocument(rawText, { prettyErrors: false });

  if (document.errors.length > 0) {
    return {
      source,
      status: "invalid",
      rawText,
      diagnostics: document.errors.map((error) =>
        createQualityMapDiagnostic(source, {
          severity: "error",
          code: "INVALID_YAML",
          message: error.message,
          yamlPath: "$",
          rawText
        })
      )
    };
  }

  const value = document.toJSON() as unknown;

  if (!isRecord(value)) {
    return {
      source,
      status: "invalid",
      rawText,
      diagnostics: [
        createQualityMapDiagnostic(source, {
          severity: "error",
          code: "EMPTY_OR_NON_OBJECT_MAP",
          message: "Quality map must contain a YAML object.",
          yamlPath: "$",
          rawText
        })
      ]
    };
  }

  return {
    source,
    status: "parsed",
    rawText,
    rawDocument: value as QualityMapDocument,
    diagnostics: []
  };
}

export function parseQualityMaps(sources: readonly QualityMapSource[]): QualityMapParseBatch {
  const results = sources.map(parseQualityMapSource);

  return {
    results,
    diagnostics: results.flatMap((result) => result.diagnostics)
  };
}

function parseQualityMapSource(source: QualityMapSource): NormalizedQualityGraphResult {
  try {
    return normalizeQualityMap(validateQualityMap(parseQualityMap(source)));
  } catch {
    return {
      source,
      status: "invalid",
      diagnostics: [
        createQualityMapDiagnostic(source, {
          severity: "error",
          code: "QUALITY_MAP_PARSE_FAILED",
          message: "Quality map could not be parsed safely.",
          yamlPath: "$",
          rawText: ""
        })
      ]
    };
  }
}
