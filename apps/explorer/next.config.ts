import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@shiplightai/quality-core", "@shiplightai/quality-map"],
};

export default config;
