import { requireQcSession } from "@/lib/quality-explorer/require-session";
import { NextResponse } from "next/server";
import { getQcDataAccessForRequest, isQcOperationError } from "@/lib/quality-explorer/data-access";
import { problemResponse as problem } from "@/lib/quality-explorer/route-problem";
import { executeObservationSetRequestSchema } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireQcSession();
  if (unauthorized) return unauthorized;

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = executeObservationSetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, "invalid-observation-set-request", "Project path and observation set id are required.");
  }

  try {
    const result = await (await getQcDataAccessForRequest()).executeObservationSet(parsed.data);
    return NextResponse.json({ result });
  } catch (error) {
    if (isQcOperationError(error)) return problem(error.status, error.code, error.message, error.diagnostics ?? []);
    throw error;
  }
}
