import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    analytics: "src/analytics/index.ts",
    "evidence-view": "src/evidence-view/index.ts",
    "fix-prompts": "src/fix-prompts/index.ts",
    "observation-sets": "src/observation-sets/index.ts",
    "gap-triage": "src/gap-triage/index.ts",
    "observation-sources": "src/observation-sources/index.ts",
    observations: "src/observations/index.ts",
    operations: "src/operations/index.ts",
    "recommendation-export": "src/recommendation-export/index.ts",
    "owner-view": "src/owner-view/index.ts",
    "project-map": "src/project-map/index.ts",
    "project-index": "src/project-index/index.ts",
    priority: "src/quality-structure/priority.ts",
    assessment: "src/quality-structure/assessment.ts",
    views: "src/views/index.ts",
    "views-server": "src/views/server.ts",
    workspace: "src/workspace/index.ts"
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
  onSuccess:
    "cp src/observation-sets/observation-sets.schema.json dist/observation-sets.schema.json && cp src/observation-sources/observation-sources.schema.json dist/observation-sources.schema.json && cp src/observations/quality-observations.schema.json dist/quality-observations.schema.json"
});
