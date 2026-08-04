"use server";

import type { QcProjectSelection } from "@shiplightai/quality-ui";

/**
 * Quality Explorer fixes its project root when the server starts (`qualityProjectRoot()`), so there
 * is nothing to persist — switching projects means restarting with a different root. Quality Center
 * implements the same contract by writing the `qc_project` cookie after an auth check.
 *
 * Takes the full `QcProjectSelection` (not just the `local` arm) so it satisfies the host contract:
 * a handler accepting a narrower parameter than the interface declares is not assignable.
 */
export async function setQcProjectAction(
  _project: QcProjectSelection,
): Promise<{ readonly ok: true } | { readonly error: string }> {
  return { error: "Quality Explorer fixes the project root when the server starts." };
}
