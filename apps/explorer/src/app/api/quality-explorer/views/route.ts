import { requireQcSession } from "@/lib/quality-explorer/require-session";
import { QC_WRITES_ENABLED, qcReadOnlyResponse } from "@/lib/quality-explorer/read-only";
import { NextResponse } from "next/server";
import { getQcDataAccessForRequest, isQcOperationError } from "@/lib/quality-explorer/data-access";
import { routeProblem } from "@/lib/quality-explorer/route-problem";
import { saveViewsRequestSchema } from "./schema";

const { problem, validationDiagnostic } = routeProblem("/api/views", "INVALID_SAVED_VIEW");

export async function PUT(request: Request): Promise<Response> {
  const unauthorized = await requireQcSession();
  if (unauthorized) return unauthorized;

  // Read-only QC (spec 045): authenticated callers get 405 here before any write runs (the auth
  // check above keeps anon callers from probing that the endpoint is disabled). Handler kept dormant.
  if (!QC_WRITES_ENABLED) return qcReadOnlyResponse();

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = saveViewsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(problem(validationDiagnostic("Saved views requests must include projectPath and views."), 400), {
      status: 400,
    });
  }

  try {
    return NextResponse.json(await (await getQcDataAccessForRequest()).saveViews(parsed.data));
  } catch (error) {
    if (isQcOperationError(error)) {
      const primary = error.diagnostics?.[0] ?? validationDiagnostic(error.message);
      return NextResponse.json(problem(primary, error.status, error.diagnostics), { status: error.status });
    }
    throw error;
  }
}
