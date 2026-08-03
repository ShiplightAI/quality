import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import {
  SOURCE_KINDS,
  SOURCE_STATUSES,
  type HumanSource,
  type HumanSourcesSource,
  type ParsedHumanSources,
  type SourceKind,
  type SourceOrigin,
  type SourceStatus,
  type SourcesDiagnostic
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function diagnostic(input: {
  readonly severity: SourcesDiagnostic["severity"];
  readonly code: string;
  readonly message: string;
  readonly path: string;
}): SourcesDiagnostic {
  return input;
}

function isKind(value: string): value is SourceKind {
  return (SOURCE_KINDS as readonly string[]).includes(value);
}

function isStatus(value: string): value is SourceStatus {
  return (SOURCE_STATUSES as readonly string[]).includes(value);
}

/**
 * Parse the human-sources layer. A missing file is NOT an error — the layer is
 * optional, so absence yields an empty parsed document. Soft problems (unknown
 * kind/status, duplicate keys, dangling supersedes) are reported as diagnostics
 * while still returning the valid entries.
 */
export function parseHumanSources(source: HumanSourcesSource): ParsedHumanSources {
  let rawText: string;
  try {
    rawText = readFileSync(source.resolvedLocalPath, "utf8");
  } catch {
    return { source, status: "parsed", document: { sources: [] }, diagnostics: [] };
  }

  const document = parseDocument(rawText, { prettyErrors: false });
  if (document.errors.length > 0) {
    return {
      source,
      status: "invalid",
      diagnostics: document.errors.map((error) =>
        diagnostic({
          severity: "error",
          code: "INVALID_SOURCES_YAML",
          message: error.message,
          path: source.projectRelativePath
        })
      )
    };
  }

  const value = document.toJSON() as unknown;
  if (value === null || value === undefined) {
    return { source, status: "parsed", document: { sources: [] }, diagnostics: [] };
  }
  if (!isRecord(value)) {
    return {
      source,
      status: "invalid",
      diagnostics: [
        diagnostic({
          severity: "error",
          code: "EMPTY_OR_NON_OBJECT_SOURCES",
          message: "Sources file must contain a YAML object with a `sources` list.",
          path: source.projectRelativePath
        })
      ]
    };
  }

  const diagnostics: SourcesDiagnostic[] = [];
  const sources: HumanSource[] = [];
  const seenKeys = new Set<string>();
  const rawList = Array.isArray(value.sources) ? value.sources : [];

  rawList.forEach((item) => {
    if (!isRecord(item)) {
      return;
    }
    const key = stringValue(item.key);
    if (key === undefined) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "SOURCE_MISSING_KEY",
          message: "A source entry has no `key` and was skipped.",
          path: source.projectRelativePath
        })
      );
      return;
    }
    if (seenKeys.has(key)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "DUPLICATE_SOURCE_KEY",
          message: `Source key ${key} is defined more than once.`,
          path: source.projectRelativePath
        })
      );
      return;
    }
    seenKeys.add(key);

    const kindRaw = stringValue(item.kind) ?? "doc";
    const kind: SourceKind = isKind(kindRaw) ? kindRaw : "doc";
    if (!isKind(kindRaw)) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "INVALID_SOURCE_KIND",
          message: `Source ${key} has unknown kind ${kindRaw}; defaulted to doc.`,
          path: source.projectRelativePath
        })
      );
    }

    const statusRaw = stringValue(item.status) ?? "current";
    const status: SourceStatus = isStatus(statusRaw) ? statusRaw : "current";
    if (!isStatus(statusRaw)) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "INVALID_SOURCE_STATUS",
          message: `Source ${key} has unknown status ${statusRaw}; defaulted to current.`,
          path: source.projectRelativePath
        })
      );
    }

    const originRaw = stringValue(item.origin);
    const origin: SourceOrigin = originRaw === "human" || originRaw === "agent" ? originRaw : "agent";
    if (originRaw !== undefined && originRaw !== "human" && originRaw !== "agent") {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          code: "INVALID_SOURCE_ORIGIN",
          message: `Source ${key} has unknown origin ${originRaw}; defaulted to agent.`,
          path: source.projectRelativePath
        })
      );
    }
    const supersededBy = stringValue(item.superseded_by);

    sources.push({
      key,
      kind,
      origin,
      status,
      ...(supersededBy === undefined ? {} : { supersededBy }),
      ...(stringValue(item.label) === undefined ? {} : { label: stringValue(item.label)! }),
      ...(stringValue(item.note) === undefined ? {} : { note: stringValue(item.note)! })
    });
  });

  // `superseded` must point at a present key.
  sources.forEach((entry) => {
    if (entry.status !== "superseded") {
      return;
    }
    if (entry.supersededBy === undefined || entry.supersededBy === entry.key || !seenKeys.has(entry.supersededBy)) {
      diagnostics.push(
        diagnostic({
          severity: "error",
          code: "DANGLING_SUPERSEDED_BY",
          message: `Source ${entry.key} is superseded but its superseded_by does not reference a known, different source.`,
          path: source.projectRelativePath
        })
      );
    }
  });

  return { source, status: "parsed", document: { sources }, diagnostics };
}
