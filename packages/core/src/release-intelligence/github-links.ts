import type { SourceReference } from './types';

const FULL_SHA = /^[0-9a-f]{40}$/i;

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function githubCommitUrl(repoFullName: string, commitSha: string): string {
  assertRepoAndCommit(repoFullName, commitSha);
  return `https://github.com/${repoFullName}/commit/${commitSha}`;
}

export function githubSourceUrl(
  repoFullName: string,
  commitSha: string,
  source: SourceReference,
): string {
  assertRepoAndCommit(repoFullName, commitSha);
  if (source.path.startsWith('/') || source.path.split('/').includes('..')) {
    throw new Error('source path must be repository-relative');
  }
  const start = source.startLine;
  const end = source.endLine;
  if ((start !== undefined && start < 1) || (end !== undefined && (start === undefined || end < start))) {
    throw new Error('source line range is invalid');
  }
  const anchor = start === undefined ? '' : end === undefined ? `#L${start}` : `#L${start}-L${end}`;
  return `https://github.com/${repoFullName}/blob/${commitSha}/${encodePath(source.path)}${anchor}`;
}

function assertRepoAndCommit(repoFullName: string, commitSha: string): void {
  const [owner, repo, extra] = repoFullName.split('/');
  if (!owner || !repo || extra) throw new Error('repository must be owner/name');
  if (!FULL_SHA.test(commitSha)) throw new Error('commit SHA must be a full 40-character SHA');
}
