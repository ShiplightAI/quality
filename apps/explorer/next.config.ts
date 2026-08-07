import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Pin the workspace root. Turbopack otherwise infers it by walking up for the nearest
// lockfile, which escapes the repository whenever a stray package.json/package-lock.json
// exists in a parent directory (e.g. the user's home) and then resolves dependencies
// against the wrong node_modules.
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const config: NextConfig = {
  // quality-ui ships TypeScript source (its components carry "use client" directives, which a
  // bundled build would have to re-emit per chunk), so Next compiles it like first-party code.
  transpilePackages: ["@shiplightai/quality-core", "@shiplightai/quality-map", "@shiplightai/quality-ui"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default config;
