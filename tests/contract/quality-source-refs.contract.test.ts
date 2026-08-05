import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface SourceReference {
  readonly path?: unknown;
  readonly anchor?: unknown;
}

interface LocatedSourceReference {
  readonly mapPath: string;
  readonly yamlPath: string;
  readonly path: string;
  readonly anchor?: string;
}

function qualitySourceFiles(repoRoot: string): readonly string[] {
  const evidenceRoot = path.join(repoRoot, ".quality", "evidence");
  const qualityMaps = readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(evidenceRoot, entry.name, "quality-map.yaml"))
    .filter(existsSync);

  return [path.join(repoRoot, ".quality", "project-map.yaml"), ...qualityMaps];
}

function collectSourceReferences(
  value: unknown,
  mapPath: string,
  yamlPath = "$"
): readonly LocatedSourceReference[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectSourceReferences(entry, mapPath, `${yamlPath}[${index}]`)
    );
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const sourceReferences = Array.isArray(record.source_refs)
    ? record.source_refs.flatMap((entry, index) => {
        if (typeof entry !== "object" || entry === null) {
          return [];
        }
        const sourceReference = entry as SourceReference;
        if (typeof sourceReference.path !== "string") {
          return [];
        }
        return [{
          mapPath,
          yamlPath: `${yamlPath}.source_refs[${index}]`,
          path: sourceReference.path,
          ...(typeof sourceReference.anchor === "string"
            ? { anchor: sourceReference.anchor }
            : {})
        }];
      })
    : [];

  return [
    ...sourceReferences,
    ...Object.entries(record).flatMap(([key, child]) =>
      key === "source_refs"
        ? []
        : collectSourceReferences(child, mapPath, `${yamlPath}.${key}`)
    )
  ];
}

function searchableMarkdown(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

describe("repository quality source references", () => {
  it("keeps local source paths and Markdown anchors resolvable", () => {
    const repoRoot = path.resolve(".");
    const references = qualitySourceFiles(repoRoot).flatMap((mapPath) =>
      collectSourceReferences(parse(readFileSync(mapPath, "utf8")), path.relative(repoRoot, mapPath))
    );
    const failures: string[] = [];

    for (const reference of references) {
      const sourcePath = path.resolve(repoRoot, reference.path);
      const label = `${reference.mapPath} ${reference.yamlPath}`;
      if (!existsSync(sourcePath)) {
        failures.push(`${label}: source path does not exist: ${reference.path}`);
        continue;
      }
      if (reference.anchor === undefined || path.extname(sourcePath).toLowerCase() !== ".md") {
        continue;
      }

      const markdown = searchableMarkdown(readFileSync(sourcePath, "utf8"));
      const anchor = searchableMarkdown(reference.anchor);
      if (anchor.length > 0 && !markdown.includes(anchor)) {
        failures.push(
          `${label}: Markdown anchor was not found in ${reference.path}: ${reference.anchor}`
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
