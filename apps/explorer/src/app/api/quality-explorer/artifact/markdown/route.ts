import { requireQcSession } from "@/lib/quality-explorer/require-session";
import { NextResponse } from "next/server";
import { getQcDataAccessForRequest, isQcOperationError } from "@/lib/quality-explorer/data-access";
import { problemResponse as problem } from "@/lib/quality-explorer/route-problem";
import { markdownArtifactRequestSchema } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireQcSession();
  if (unauthorized) return unauthorized;

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = markdownArtifactRequestSchema.safeParse(body);

  if (!parsed.success) {
    return problem(400, "invalid-markdown-artifact-request", "Project path and artifact path are required.");
  }

  const { projectPath, artifactPath } = parsed.data;

  try {
    const artifact = await (await getQcDataAccessForRequest()).readMarkdownArtifact(projectPath, artifactPath);
    return NextResponse.json(artifact);
  } catch (error) {
    if (isQcOperationError(error)) return problem(error.status, error.code, error.message);
    return problem(404, "artifact-not-found", "The selected Markdown artifact could not be read.");
  }
}
