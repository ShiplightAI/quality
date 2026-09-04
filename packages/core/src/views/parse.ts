import { readFileSync } from "node:fs";
import { WHOLE_PROJECT_VIEW_ID } from "./types";
import { parseDocument } from "yaml";
import type {
  ParsedSavedQcViews,
  ParsedSavedQcViewsDocument,
  SavedQcView,
  SavedQcViewDiagnostic,
  SavedQcViewParseBatch,
  SavedQcViewSource
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function diagnostic(
  source: SavedQcViewSource,
  input: {
    readonly severity: SavedQcViewDiagnostic["severity"];
    readonly code: string;
    readonly message: string;
    readonly yamlPath?: string;
  }
): SavedQcViewDiagnostic {
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    viewsPath: source.projectRelativePath,
    yamlPath: input.yamlPath ?? "$"
  };
}

function featureIds(
  value: unknown,
  source: SavedQcViewSource,
  yamlPath: string,
  diagnostics: SavedQcViewDiagnostic[]
): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  const duplicates = new Set<string>();
  const seen = new Set<string>();

  parsed.forEach((featureId) => {
    if (seen.has(featureId)) {
      duplicates.add(featureId);
      return;
    }
    seen.add(featureId);
  });

  duplicates.forEach((featureId) => {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "DUPLICATE_SAVED_VIEW_FEATURE_ID",
        message: `Saved view feature id ${featureId} is listed more than once.`,
        yamlPath
      })
    );
  });

  return parsed;
}

function savedViewFrom(
  value: unknown,
  source: SavedQcViewSource,
  index: number,
  diagnostics: SavedQcViewDiagnostic[]
): SavedQcView | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_SAVED_VIEW",
        message: `Saved view entry ${index} must be a mapping.`,
        yamlPath: `$.views[${index}]`
      })
    );
    return undefined;
  }

  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const nextFeatureIds = featureIds(value.feature_ids, source, `$.views[${index}].feature_ids`, diagnostics);

  // Enforced here, not only in the published schema: the schema is what an
  // author validates against, but this parser is what actually runs during a
  // scan, and a rule only one of them applies is a rule the product does not
  // really have.
  if (id !== undefined && id === WHOLE_PROJECT_VIEW_ID) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_SAVED_VIEW",
        message: `Saved view id ${WHOLE_PROJECT_VIEW_ID} is reserved for the unscoped assessment.`,
        yamlPath: `$.views[${index}].id`
      })
    );
    return undefined;
  }

  if (id === undefined || name === undefined) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_SAVED_VIEW",
        message: `Saved view entry ${index} must include id and name.`,
        yamlPath: `$.views[${index}]`
      })
    );
    return undefined;
  }

  if (nextFeatureIds.length === 0) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "EMPTY_SAVED_VIEW",
        message: `Saved view ${id} must reference at least one project-map feature id.`,
        yamlPath: `$.views[${index}].feature_ids`
      })
    );
  }

  return {
    id,
    name,
    description: stringValue(value.description),
    featureIds: nextFeatureIds
  };
}

function parseResultForSource(source: SavedQcViewSource): ParsedSavedQcViews {
  const rawText = readFileSync(source.resolvedLocalPath, "utf8");
  const diagnostics: SavedQcViewDiagnostic[] = [];

  let documentValue: unknown;
  try {
    documentValue = parseDocument(rawText).toJSON();
  } catch (error) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_SAVED_VIEW",
        message: `Saved views YAML could not be parsed: ${error instanceof Error ? error.message : String(error)}`
      })
    );

    return {
      source,
      status: "invalid",
      rawText,
      diagnostics
    };
  }

  if (!isRecord(documentValue)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_SAVED_VIEW",
        message: "Saved views must be a top-level mapping."
      })
    );

    return {
      source,
      status: "invalid",
      rawText,
      diagnostics
    };
  }

  if (!Array.isArray(documentValue.views)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_SAVED_VIEW",
        message: "Saved views must define a views array.",
        yamlPath: "$.views"
      })
    );

    return {
      source,
      status: "invalid",
      rawText,
      diagnostics
    };
  }

  const views = documentValue.views.flatMap((entry, index) => {
    const next = savedViewFrom(entry, source, index, diagnostics);
    return next === undefined ? [] : [next];
  });

  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  views.forEach((view) => {
    if (seenIds.has(view.id)) {
      duplicateIds.add(view.id);
      return;
    }
    seenIds.add(view.id);
  });

  duplicateIds.forEach((viewId) => {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "DUPLICATE_SAVED_VIEW_ID",
        message: `Saved view id ${viewId} is defined more than once.`,
        yamlPath: "$.views"
      })
    );
  });

  const document: ParsedSavedQcViewsDocument = { views };

  return {
    source,
    status: diagnostics.some((entry) => entry.severity === "error") ? "invalid" : "parsed",
    rawText,
    document,
    diagnostics
  };
}

export function parseSavedQcViews(
  sources: readonly SavedQcViewSource[]
): SavedQcViewParseBatch {
  const results = sources.map((source) => parseResultForSource(source));
  const primary = results[0];

  return {
    results,
    primary,
    diagnostics: results.flatMap((result) => result.diagnostics)
  };
}
