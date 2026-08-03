import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface FixtureFile {
  readonly relativePath: string;
  readonly contents?: string;
  readonly mode?: number;
}

export interface FixtureProject {
  readonly root: string;
  cleanup(): Promise<void>;
}

export async function createFixtureProject(
  name: string,
  files: readonly FixtureFile[]
): Promise<FixtureProject> {
  const root = await mkdtemp(path.join(os.tmpdir(), `quality-explorer-${name}-`));

  for (const file of files) {
    await writeFixtureFile(root, file.relativePath, file.contents ?? "");
    if (file.mode !== undefined) {
      await chmod(path.join(root, file.relativePath), file.mode);
    }
  }

  return {
    root,
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    }
  };
}

export async function writeFixtureFile(
  root: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const resolvedPath = path.join(root, relativePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, contents, "utf8");
}

export async function createNonQualityFiles(
  root: string,
  count: number
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await writeFixtureFile(
      root,
      `unrelated/nested-${Math.floor(index / 100)}/file-${index}.txt`,
      `unrelated ${index}`
    );
  }
}
