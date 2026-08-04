import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guard: nothing that reaches a Client Component may import the `@shiplightai/quality-core` barrel
// as a *value*. The barrel pulls in observation-sources -> adm-zip -> node:fs, which only the
// browser bundler rejects — tsc and vitest both pass while the host's build breaks. Subpath imports
// (`@shiplightai/quality-core/views`) and `import type` are erased or client-safe.
//
// This lives here rather than in a host repo because the modules it guards are published by this
// package: a host consuming the package cannot fix a barrel import it does not own.

const dir = fileURLToPath(new URL(".", import.meta.url));
const componentsDir = fileURLToPath(new URL("../components/", import.meta.url));

const sources = [
  ...readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)).map((f) => `${dir}${f}`),
  ...readdirSync(componentsDir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)).map((f) => `${componentsDir}${f}`),
];

const staticValueBarrel = /import\s+(?!type\b)[^;]*?from\s+["']@shiplightai\/quality-core["']/g;
const dynamicBarrel = /import\s*\(\s*["']@shiplightai\/quality-core["']\s*\)/g;

describe("quality-ui client bundle boundary", () => {
  it("guards a non-trivial set of modules (so a bad glob cannot pass vacuously)", () => {
    expect(sources.length).toBeGreaterThanOrEqual(25);
  });

  it.each(sources.map((f) => [f.replace(/^.*\/src\//, "src/"), f]))(
    "%s never imports the @shiplightai/quality-core barrel as a value",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(source.match(staticValueBarrel) ?? []).toEqual([]);
      expect(source.match(dynamicBarrel) ?? []).toEqual([]);
    },
  );
});
