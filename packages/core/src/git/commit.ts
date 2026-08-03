import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// "nothing_to_commit" is ONLY the empty-input guard (files.length === 0). A
// byte-identical write is NOT an error — it returns committed: false (idempotent).
export type CommitErrorReason = "not_a_repo" | "nothing_to_commit" | "git_failed";

/**
 * Typed failure for {@link commitFiles}. Routes map each reason to an actionable
 * HTTP response (not_a_repo / git_failed → 409). A byte-identical write is NOT an
 * error — see {@link CommitResult.committed}.
 */
export class CommitError extends Error {
  readonly reason: CommitErrorReason;

  constructor(reason: CommitErrorReason, message: string) {
    super(message);
    this.name = "CommitError";
    this.reason = reason;
  }
}

export interface CommitResult {
  readonly sha: string;
  /** False when the files were byte-identical to HEAD (an idempotent no-op). */
  readonly committed: boolean;
}

/**
 * Stage exactly `files` (relative to `repoPath`) and commit them with `message`.
 * Scoped on purpose — never `git add -A` — so a gating action commits only the
 * QC-owned file it changed and leaves the rest of the working tree untouched.
 *
 * A write that produced no net change (byte-identical to HEAD) is an idempotent
 * no-op: it returns the current HEAD with `committed: false` rather than failing,
 * so re-saving unchanged content is not surfaced as an error.
 */
export async function commitFiles(
  repoPath: string,
  files: readonly string[],
  message: string
): Promise<CommitResult> {
  if (files.length === 0) {
    throw new CommitError("nothing_to_commit", "No files were provided to commit.");
  }

  try {
    await run("git", ["rev-parse", "--git-dir"], { cwd: repoPath });
  } catch (error) {
    // Surfaces the cause (e.g. ENOENT when git is not on PATH) instead of a bare
    // "not a git repository" message.
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new CommitError("not_a_repo", `${repoPath} is not a git repository.${detail}`);
  }

  try {
    await run("git", ["add", "--", ...files], { cwd: repoPath });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "git add failed.";
    throw new CommitError("git_failed", detail);
  }

  // `git diff --cached --quiet` exits 0 when nothing is staged, non-zero when
  // there are staged changes. A resolve means the write was a no-op.
  let hasStagedChanges = false;
  try {
    await run("git", ["diff", "--cached", "--quiet", "--", ...files], { cwd: repoPath });
  } catch {
    hasStagedChanges = true;
  }
  if (!hasStagedChanges) {
    return { sha: await headSha(repoPath), committed: false };
  }

  try {
    await run("git", ["commit", "-m", message, "--", ...files], { cwd: repoPath });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "git commit failed.";
    throw new CommitError("git_failed", detail);
  }

  return { sha: await headSha(repoPath), committed: true };
}

// `git rev-parse HEAD` fails on a repo with no commits (unborn HEAD); map that to
// a typed CommitError rather than letting a raw exec rejection surface as a 500.
async function headSha(repoPath: string): Promise<string> {
  try {
    const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    return stdout.trim();
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new CommitError("git_failed", `Could not resolve HEAD — the repository may have no commits yet.${detail}`);
  }
}
