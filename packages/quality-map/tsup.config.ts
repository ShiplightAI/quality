import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "gap-categories": "src/gap-categories.ts"
  },
  format: ["esm"],
  target: "node24",
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  bundle: true,
  splitting: false,
  sourcemap: false,
  onSuccess: "cp src/quality-map.schema.json dist/quality-map.schema.json"
});
