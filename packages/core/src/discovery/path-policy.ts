import path from "node:path";

export function isNonLocalPath(inputPath: string): boolean {
  const trimmed = inputPath.trim();
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed);
}

export function resolveLocalPath(inputPath: string): string {
  return path.resolve(inputPath.trim());
}

export function displayNameForPath(resolvedPath: string): string {
  return path.basename(resolvedPath) || resolvedPath;
}

export function toProjectRelativePath(
  projectRoot: string,
  resolvedPath: string
): string | null {
  const relativePath = path.relative(projectRoot, resolvedPath);
  if (relativePath === "") {
    return ".";
  }

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.split(path.sep).join("/");
}
