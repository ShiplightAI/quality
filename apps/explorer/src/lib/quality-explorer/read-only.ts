import { problemResponse } from "./route-problem";

export const QC_WRITES_ENABLED = false;

export function qcReadOnlyResponse(): Response {
  return problemResponse(405, "qc-read-only", "Quality Explorer is read-only; edit .quality/** through code review.");
}
