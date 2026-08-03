import { createDiagnostic, type DiagnosticCode, type ScanDiagnostic } from "@shiplightai/quality-core";
import { NextResponse } from "next/server";

export function problemResponse(
  status: number,
  code: string,
  detail: string,
  diagnostics: readonly ScanDiagnostic[] = [],
): NextResponse {
  return NextResponse.json(
    { type: `https://quality.local/problems/${code}`, title: detail, status, detail, diagnostics },
    { status },
  );
}

export function routeProblem(instance: string, code: DiagnosticCode) {
  const validationDiagnostic = (message: string): ScanDiagnostic =>
    createDiagnostic({ severity: "error", code, message });
  const problem = (primary: ScanDiagnostic, status: number, diagnostics: readonly ScanDiagnostic[] = [primary]) => ({
    type: `https://quality.local/problems/${primary.code.toLowerCase().replaceAll("_", "-")}`,
    title: primary.message,
    status,
    detail: primary.message,
    instance,
    diagnostics,
  });
  return { problem, validationDiagnostic };
}
