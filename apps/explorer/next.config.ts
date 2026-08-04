import type { NextConfig } from "next";

const config: NextConfig = {
  // quality-ui ships TypeScript source (its components carry "use client" directives, which a
  // bundled build would have to re-emit per chunk), so Next compiles it like first-party code.
  transpilePackages: ["@shiplightai/quality-core", "@shiplightai/quality-map", "@shiplightai/quality-ui"],
};

export default config;
