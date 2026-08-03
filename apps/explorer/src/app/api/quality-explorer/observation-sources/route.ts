import { qcReadOnlyResponse } from "@/lib/quality-explorer/read-only";

export async function PUT(): Promise<Response> {
  return qcReadOnlyResponse();
}
