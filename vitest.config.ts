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
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["apps/explorer/**/*.test.tsx", "jsdom"]],
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
