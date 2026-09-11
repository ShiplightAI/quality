import { describe, expect, it } from 'vitest';
import { parseWorkflowReference } from './workflow-reference';

describe('parseWorkflowReference', () => {
  it('accepts a workflow run id', () => {
    expect(parseWorkflowReference('12345')).toEqual({ runId: '12345' });
  });

  it('accepts a GitHub workflow run URL pinned to an attempt', () => {
    expect(parseWorkflowReference('https://github.com/ShiplightAI/shipyard/actions/runs/123/attempts/2')).toEqual({
      owner: 'ShiplightAI', repo: 'shipyard', runId: '123', runAttempt: 2,
    });
  });

  it('rejects non-run URLs', () => {
    expect(parseWorkflowReference('https://github.com/a/b/actions')).toBeNull();
  });
});
