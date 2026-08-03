export interface CommandResult {
  readonly exitCode: number;
}

export function printCommandError(error: unknown): CommandResult {
  console.error(error instanceof Error ? error.message : String(error));
  return { exitCode: 1 };
}
