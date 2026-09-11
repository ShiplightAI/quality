import { describe, expect, it } from 'vitest';
import { githubCommitUrl, githubSourceUrl } from './github-links';

const sha = '1234567890abcdef1234567890abcdef12345678';

describe('release intelligence GitHub links', () => {
  it('pins commit and source links to the full immutable SHA', () => {
    expect(githubCommitUrl('ShiplightAI/shipyard', sha)).toBe(
      `https://github.com/ShiplightAI/shipyard/commit/${sha}`,
    );
    expect(
      githubSourceUrl('ShiplightAI/shipyard', sha, {
        path: 'specs/password reset/spec.md',
        startLine: 42,
        endLine: 47,
      }),
    ).toBe(
      `https://github.com/ShiplightAI/shipyard/blob/${sha}/specs/password%20reset/spec.md#L42-L47`,
    );
  });

  it('rejects moving refs and paths that escape the repository', () => {
    expect(() => githubCommitUrl('ShiplightAI/shipyard', 'main')).toThrow(/full 40-character/);
    expect(() => githubSourceUrl('ShiplightAI/shipyard', sha, { path: '../secret' })).toThrow(
      /repository-relative/,
    );
  });
});
