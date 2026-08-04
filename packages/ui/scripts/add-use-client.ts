import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// esbuild strips module-level directives when bundling ("Module level directives cause errors when
// bundled, \"use client\" ... was ignored"), and tsup's `banner` does not survive code splitting.
// Every emitted chunk here contains client components or hooks, so re-add the directive to all of
// them after the build.
//
// Without this the package builds and typechecks cleanly but every consumer breaks at runtime:
// Next treats the modules as Server Components and the first useState/useContext throws.

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const DIRECTIVE = '"use client";\n';

// `helpers` is deliberately Next-free and framework-free so a plain-Node consumer can import it.
// Marking it "use client" would make it a client module and defeat that.
const SERVER_SAFE = new Set(["helpers.js"]);

const jsFiles = readdirSync(distDir)
  .filter((f) => f.endsWith(".js"))
  .filter((f) => !SERVER_SAFE.has(f));
if (jsFiles.length === 0) {
  throw new Error("add-use-client: no .js files in dist — did the build run?");
}

let patched = 0;
for (const file of jsFiles) {
  const path = resolve(distDir, file);
  const source = readFileSync(path, "utf8");
  if (source.startsWith('"use client"') || source.startsWith("'use client'")) continue;
  writeFileSync(path, DIRECTIVE + source);
  patched += 1;
}

console.log(`add-use-client: ${patched}/${jsFiles.length} chunk(s) marked`);

// Fail loudly rather than shipping a package that breaks on first render.
for (const file of jsFiles) {
  const source = readFileSync(resolve(distDir, file), "utf8");
  if (!source.startsWith('"use client"')) {
    console.error(`add-use-client: ${file} is missing the directive`);
    process.exit(1);
  }
}
