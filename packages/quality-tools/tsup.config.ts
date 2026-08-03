import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts"
  },
  format: ["esm"],
  target: "node24",
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  bundle: true,
  minify: true,
  splitting: true,
  sourcemap: false,
  noExternal: ["@shiplightai/quality-core", "@shiplightai/quality-map"],
  external: ["adm-zip", "fast-xml-parser", "yaml"],
  // Ship the canonical quality-map JSON Schema as a resolvable package asset
  // (exports["./quality-map.schema.json"]) so editors / $ref consumers can read it without a
  // copy. It is byte-identical to `quality-tools schema` output (both from buildQualityMapJsonSchema).
  onSuccess:
    "cp ../quality-map/src/quality-map.schema.json dist/quality-map.schema.json && cp ../core/src/observations/quality-observations.schema.json dist/quality-observations.schema.json"
});
