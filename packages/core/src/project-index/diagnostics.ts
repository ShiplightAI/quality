import type {
  IndexDiagnosticDetail,
  IndexDiagnosticSeverityCounts,
  IndexDiagnosticSummary
} from "./types";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import type { ScanResult } from "../discovery/types";

function scanDiagnosticDetail(diagnostic: ScanDiagnostic, index: number): IndexDiagnosticDetail {
  return {
    id: `scan:${diagnostic.code}:${index}`,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.affectedPath === undefined ? {} : { sourcePath: diagnostic.affectedPath })
  };
}

export function buildDiagnosticSummary(
  result: ScanResult | undefined,
  extraDiagnostics: readonly ScanDiagnostic[] = []
): IndexDiagnosticSummary {
  const details: IndexDiagnosticDetail[] = [];

  [...extraDiagnostics, ...(result?.diagnostics ?? [])].forEach((diagnostic, index) => {
    details.push(scanDiagnosticDetail(diagnostic, index));
  });

  result?.qualityMaps.diagnostics.forEach((diagnostic, index) => {
    details.push({
      id: `quality-map:${diagnostic.code}:${diagnostic.mapPath}:${index}`,
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      sourcePath: diagnostic.mapPath,
      ...(diagnostic.affectedEntityId === undefined
        ? {}
        : { affectedTargetId: diagnostic.affectedEntityId })
    });
  });

  result?.projectMaps.diagnostics.forEach((diagnostic, index) => {
    details.push({
      id: `project-map:${diagnostic.code}:${diagnostic.mapPath}:${index}`,
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      sourcePath: diagnostic.mapPath
    });
  });

  result?.observationSourceProfiles.diagnostics.forEach((diagnostic, index) => {
    details.push({
      id: `observation-source:${diagnostic.code}:${diagnostic.profilePath}:${index}`,
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      sourcePath: diagnostic.profilePath
    });
  });

  result?.markdownFallback.diagnostics.forEach((diagnostic, index) => {
    details.push({
      id: `markdown:${diagnostic.code}:${diagnostic.artifactPath}:${index}`,
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      sourcePath: diagnostic.artifactPath
    });
  });

  const severityCounts: IndexDiagnosticSeverityCounts = {
    error: details.filter((detail) => detail.severity === "error").length,
    warning: details.filter((detail) => detail.severity === "warning").length,
    info: details.filter((detail) => detail.severity === "info").length
  };

  return {
    severityCounts,
    details
  };
}
