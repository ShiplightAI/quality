import { defineConfig } from "tsup";

// Build config for a React component library consumed by a bundler (Next), which is a different
// shape from the other packages here:
//
// - `external` (not `noExternal`): @shiplightai/quality-core is a declared dependency, and Mantine/lucide/next/react are peers. Bundling any of them would ship a second
//   copy into every consumer — quality-tools does bundle them, but it is a standalone CLI.
// - `banner: "use client"`: esbuild strips directives, and 19 of the 26 components carry
//   "use client". Every public export is a client component or a hook, so the whole entry is a
//   client module. A pure helper added here in future must NOT be called from a Server Component.
// - `sourcemap: false`: source maps must never ship (enforced by scripts/check-package-size.ts).
export default defineConfig({
  entry: { index: "src/index.ts", host: "src/host.tsx", helpers: "src/helpers.ts" },
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  outDir: "dist",
  clean: true,
  dts: true,
  bundle: true,
  minify: true,
  // No splitting: each entry must be independently loadable, and only the React entries may carry
  // the "use client" directive. Shared chunks would blur that boundary.
  splitting: false,
  treeshake: true,
  sourcemap: false,
  external: [
    "react",
    "react-dom",
    "next",
    "@mantine/core",
    "lucide-react",
    "@shiplightai/quality-core",
  ],
  // `banner` does not survive code splitting and esbuild strips source directives when bundling, so
  // the directive is re-added per chunk after the build. See scripts/add-use-client.ts.
  //
  // The stylesheet is shipped as a resolvable asset (exports["./styles.css"]). Minify it here — it
  // is a quarter of the unpacked package, and a consumer importing it gets whatever we ship.
  onSuccess:
    "esbuild src/styles.css --minify --outfile=dist/styles.css --log-level=warning && tsx scripts/add-use-client.ts",
});
