import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface ProjectFileSnapshotEntry {
  readonly relativePath: string;
  readonly contentHash: string;
  readonly mtimeMs: number;
  readonly size: number;
}

export type ProjectFileSnapshot = readonly ProjectFileSnapshotEntry[];

async function collectFiles(
  root: string,
  currentPath: string,
  entries: ProjectFileSnapshotEntry[]
): Promise<void> {
  const currentStats = await lstat(currentPath);

  if (currentStats.isDirectory()) {
    const children = await readdir(currentPath);
    for (const child of children.toSorted()) {
      await collectFiles(root, path.join(currentPath, child), entries);
    }
    return;
  }

  if (!currentStats.isFile()) {
    return;
  }

  const contents = await readFile(currentPath);
  entries.push({
    relativePath: path.relative(root, currentPath).split(path.sep).join("/"),
    contentHash: createHash("sha256").update(contents).digest("hex"),
    mtimeMs: currentStats.mtimeMs,
    size: currentStats.size
  });
}

export async function snapshotProjectFiles(root: string): Promise<ProjectFileSnapshot> {
  const entries: ProjectFileSnapshotEntry[] = [];
  await collectFiles(root, root, entries);
  return entries.toSorted((left, right) => left.relativePath.localeCompare(right.relativePath));
}
