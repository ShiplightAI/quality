import path from "node:path";

let cachedProjectRoot: string | undefined;

export function qualityProjectRoot(): string {
  cachedProjectRoot ??= path.resolve(process.env.QUALITY_PROJECT_ROOT ?? process.cwd());
  return cachedProjectRoot;
}
