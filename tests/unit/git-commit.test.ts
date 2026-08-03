import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { commitFiles } from "../../packages/core/src/git/commit";

const run = promisify(execFile);

async function initRepo(dir: string): Promise<void> {
  await run("git", ["init"], { cwd: dir });
  await run("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await run("git", ["config", "user.name", "Test"], { cwd: dir });
  await run("git", ["commit", "--allow-empty", "-m", "root"], { cwd: dir });
}

describe("commitFiles", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), "qc-git-"));
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("commits only the named files and returns the new HEAD sha", async () => {
    await initRepo(repo);
    await writeFile(path.join(repo, "tracked.txt"), "a", "utf8");
    await writeFile(path.join(repo, "other.txt"), "b", "utf8");

    const result = await commitFiles(repo, ["tracked.txt"], "qc: test");

    expect(result.sha).toMatch(/^[0-9a-f]{40}$/);
    const { stdout: committed } = await run("git", ["show", "--name-only", "--format=", "HEAD"], { cwd: repo });
    expect(committed).toContain("tracked.txt");
    expect(committed).not.toContain("other.txt");
    const { stdout: status } = await run("git", ["status", "--porcelain"], { cwd: repo });
    expect(status).toContain("other.txt"); // still uncommitted
  });

  it("throws a typed not_a_repo error outside a git repository", async () => {
    await writeFile(path.join(repo, "f.txt"), "a", "utf8");
    await expect(commitFiles(repo, ["f.txt"], "qc: test")).rejects.toMatchObject({
      name: "CommitError",
      reason: "not_a_repo"
    });
  });

  it("returns an idempotent no-op (committed: false) when the file has no staged change", async () => {
    await initRepo(repo);
    await writeFile(path.join(repo, "f.txt"), "a", "utf8");
    const first = await commitFiles(repo, ["f.txt"], "qc: first");

    const again = await commitFiles(repo, ["f.txt"], "qc: again");
    expect(again.committed).toBe(false);
    expect(again.sha).toBe(first.sha); // HEAD unchanged
  });

  it("reports committed: true when there are staged changes", async () => {
    await initRepo(repo);
    await writeFile(path.join(repo, "f.txt"), "a", "utf8");
    const result = await commitFiles(repo, ["f.txt"], "qc: first");
    expect(result.committed).toBe(true);
  });
});
