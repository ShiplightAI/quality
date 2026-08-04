import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { parseProjectMap } from "../../packages/core/src/project-map/parse";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATE = "agent-skills/quality/references/map-project/assets/project-map.template.yaml";

function template(): ReturnType<typeof parseProjectMap> {
  return parseProjectMap({
    projectRelativePath: TEMPLATE,
    resolvedLocalPath: path.join(repoRoot, TEMPLATE)
  });
}

// The skill authors the project map and the engine reads it. When the two name a
// field differently the authored value is silently discarded, which is worse
// than an error: the map looks complete and the data never arrives.
describe("project-map template contract", () => {
  it("parses the skill's template without diagnostics", () => {
    const parsed = template();

    expect(parsed.status).toBe("parsed");
    expect(parsed.diagnostics).toEqual([]);
  });

  it("delivers every document the template authors to the engine's product docs", () => {
    // Read the authored paths from the parsed YAML, not from the raw text: a
    // text probe silently matches nothing if the template is reindented or its
    // keys reordered, and the assertion then passes while checking nothing.
    const authored = parse(readFileSync(path.join(repoRoot, TEMPLATE), "utf8")) as {
      readonly product_docs?: readonly { readonly path?: string }[];
    };
    const authoredPaths = (authored.product_docs ?? []).flatMap((doc) =>
      doc.path === undefined ? [] : [doc.path]
    );
    const deliveredPaths = template().map?.productDocs.map((doc) => doc.path) ?? [];

    expect(authoredPaths.length).toBeGreaterThan(0);
    expect(deliveredPaths).toEqual(authoredPaths);
  });

  // Narrower than "no unread field": the map is authored documentation as well
  // as engine input, so fields such as `implements_prd_refs` and
  // `discovery.orphan_code_refs` are deliberately for human and agent readers
  // and the engine never reads them. What must not come back are the keys that
  // were removed, and the ordering key must stay where the engine looks.
  it("declares none of the removed keys and keeps ordering top-level", () => {
    const raw = readFileSync(path.join(repoRoot, TEMPLATE), "utf8");

    expect(raw).not.toMatch(/^intent_docs:/m);
    expect(raw).not.toMatch(/^\s*release_areas:/m);
    expect(raw).not.toMatch(/^\s*current_milestone:/m);
    expect(raw).not.toMatch(/^roadmap:/m);
    expect(raw).toMatch(/^feature_order:/m);
  });
});
