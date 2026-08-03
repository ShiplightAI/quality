import { requireQcSession } from "@/lib/quality-explorer/require-session";
import { NextResponse } from "next/server";
import { getQcDataAccessForRequest, isQcOperationError } from "@/lib/quality-explorer/data-access";
import { problemResponse as problem } from "@/lib/quality-explorer/route-problem";
import { fixPromptRequestSchema } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireQcSession();
  if (unauthorized) return unauthorized;

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = fixPromptRequestSchema.safeParse(body);

  if (!parsed.success) {
    return problem(400, "invalid-fix-prompt-request", "Project path, quality map path, and expectation id are required.");
  }

  const { expectationId, projectPath, qualityMapPath } = parsed.data;

  try {
    const { prompt } = await (await getQcDataAccessForRequest()).getFixPrompt({ projectPath, qualityMapPath, expectationId });
    return NextResponse.json({ prompt });
  } catch (error) {
    if (isQcOperationError(error)) return problem(error.status, error.code, error.message);
    return problem(500, "fix-prompt-generator-failed", "The canonical fix-prompt generator could not be executed.");
  }
}
