import { requireQcSession } from "@/lib/quality-explorer/require-session";
import { NextResponse } from "next/server";
import { getQcDataAccessForRequest, isQcOperationError } from "@/lib/quality-explorer/data-access";
import { problemResponse as problem } from "@/lib/quality-explorer/route-problem";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = await requireQcSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get("projectPath")?.trim();
  const observationSetId = searchParams.get("observationSetId")?.trim();
  const viewId = searchParams.get("viewId")?.trim();

  if (
    projectPath === undefined ||
    projectPath.length === 0
  ) {
    return problem(400, "invalid-ranked-recommendations-request", "Project path is required.");
  }

  try {
    const response = await (await getQcDataAccessForRequest()).getRecommendations({
      projectPath,
      ...(observationSetId === undefined ? {} : { observationSetId }),
      ...(viewId === undefined ? {} : { viewId })
    });
    return NextResponse.json(response);
  } catch (error) {
    if (isQcOperationError(error)) return problem(error.status, error.code, error.message);
    return problem(500, "ranked-recommendations-read-failed", "The saved recommendations file could not be read.");
  }
}
