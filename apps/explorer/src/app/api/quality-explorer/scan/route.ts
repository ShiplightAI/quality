import { requireQcSession } from "@/lib/quality-explorer/require-session";
import { NextResponse } from "next/server";
import {
  createDiagnostic,
  type ScanDiagnostic,
  type ObservationSourceProfileEnvStatus,
  type ScanResult
} from "@shiplightai/quality-core";
import { getQcDataAccessForRequest, isQcOperationError, type QcOperationError } from "@/lib/quality-explorer/data-access";
import { scanRequestSchema } from "./schema";

const EMPTY_TARGET: ScanResult["target"] = {
  inputPath: "",
  resolvedPath: "",
  displayName: "",
  validationStatus: "invalid",
  validationDiagnostic: createDiagnostic({ severity: "error", code: "SCAN_FAILED", message: "" })
};

interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly target: ScanResult["target"];
  readonly diagnostics: readonly ScanDiagnostic[];
}

interface ScanResponse {
  readonly result: ScanResult;
  readonly observationSourceEnv: readonly ObservationSourceProfileEnvStatus[];
}

function problemSlug(code: string): string {
  return code.toLowerCase().replaceAll("_", "-");
}

function problemDetailsFor(result: ScanResult): ProblemDetails {
  const primaryDiagnostic = result.diagnostics[0] ?? createDiagnostic({
    severity: "error",
    code: "EMPTY_PATH",
    message: "Enter a local project directory path."
  });

  return {
    type: `https://quality-explorer.local/problems/${problemSlug(primaryDiagnostic.code)}`,
    title: primaryDiagnostic.message,
    status: 400,
    detail: primaryDiagnostic.message,
    instance: "/api/scan",
    target: result.target,
    diagnostics: result.diagnostics
  };
}

function invalidBodyProblem(): ProblemDetails {
  const diagnostic = createDiagnostic({
    severity: "error",
    code: "EMPTY_PATH",
    message: "Enter a local project directory path."
  });
  // Reject a malformed body directly — don't round-trip to the VM (which would run a full,
  // successful scan of its own checkout and then be overridden by this synthetic diagnostic).
  return {
    type: `https://quality-explorer.local/problems/${problemSlug(diagnostic.code)}`,
    title: diagnostic.message,
    status: 400,
    detail: diagnostic.message,
    instance: "/api/scan",
    target: { ...EMPTY_TARGET, validationDiagnostic: diagnostic },
    diagnostics: [diagnostic]
  };
}

function qcOperationProblem(error: QcOperationError): ProblemDetails {
  return {
    type: `https://quality-explorer.local/problems/${problemSlug(error.code)}`,
    title: error.message,
    status: error.status,
    detail: error.message,
    instance: "/api/scan",
    target: EMPTY_TARGET,
    diagnostics: error.diagnostics ?? []
  };
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = await requireQcSession();
  if (unauthorized) return unauthorized;

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const parsedBody = scanRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(invalidBodyProblem(), { status: 400 });
    }

    // Resolve the data-access impl INSIDE the try so the selector's typed errors
    // (401/403/503/409 from getQcDataAccessForRequest in hosted mode) are mapped below,
    // not surfaced as a generic 500 like the other 10 QC routes already do.
    const dataAccess = await getQcDataAccessForRequest();
    const { result, observationSourceEnv } = await dataAccess.scan(parsedBody.data);

    if (result.status === "failed") {
      return NextResponse.json(problemDetailsFor(result), { status: 400 });
    }

    const responseBody: ScanResponse = {
      result,
      observationSourceEnv
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    if (isQcOperationError(error)) {
      return NextResponse.json(qcOperationProblem(error), { status: error.status });
    }
    // Let an unexpected error propagate (like every other QC route) so Next logs it and it's visible
    // in server-side error tracking — a synthetic 500 body here would swallow the cause.
    throw error;
  }
}
