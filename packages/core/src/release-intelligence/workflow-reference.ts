const RUN_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)(?:\/attempts\/(\d+))?(?:[/?#].*)?$/i;

export interface WorkflowReference {
  readonly owner?: string;
  readonly repo?: string;
  readonly runId: string;
  readonly runAttempt?: number;
}
export function parseWorkflowReference(value: string): WorkflowReference | null {
  const input = value.trim();
  if (/^\d+$/.test(input)) return { runId: input };
  const match = RUN_URL.exec(input);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    runId: match[3]!,
    ...(match[4] ? { runAttempt: Number(match[4]) } : {}),
  };
}
