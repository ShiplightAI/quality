import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./apps/explorer/src"),
      "@shiplightai/quality-core/priority": path.resolve(
        __dirname,
        "./packages/core/src/quality-structure/priority.ts",
      ),
      "@shiplightai/quality-core/assessment": path.resolve(
        __dirname,
        "./packages/core/src/quality-structure/assessment.ts",
      ),
      "@shiplightai/quality-core": path.resolve(__dirname, "./packages/core/src"),
      "@shiplightai/quality-map": path.resolve(__dirname, "./packages/quality-map/src"),
      "@shiplightai/quality-tools": path.resolve(__dirname, "./packages/quality-tools/src/index.ts"),
      "@shiplightai/quality-ui/styles.css": path.resolve(__dirname, "./packages/ui/src/styles.css"),
      "@shiplightai/quality-ui": path.resolve(__dirname, "./packages/ui/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    // Component tests live in packages/ui alongside the components they cover; they need a DOM.
    environmentMatchGlobs: [
      ["apps/explorer/**/*.test.tsx", "jsdom"],
      ["packages/ui/**/*.test.tsx", "jsdom"],
    ],
    // `.tsx` must be matched under packages/** too — without it the quality-ui component tests are
    // silently uncollected (they moved there from apps/explorer) and the suite still reports green.
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "tests/**/*.test.ts",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
