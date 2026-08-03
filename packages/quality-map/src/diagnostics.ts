import { locateYamlPath } from "./source-location";
import type {
  QualityMapDiagnostic,
  QualityMapDiagnosticSeverity,
  QualityMapSource
} from "./types";

interface DiagnosticInput {
  readonly severity: QualityMapDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly yamlPath: string;
  readonly rawText: string;
  readonly affectedEntityId?: string;
}

export function createQualityMapDiagnostic(
  source: QualityMapSource,
  input: DiagnosticInput
): QualityMapDiagnostic {
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    mapPath: source.projectRelativePath,
    yamlPath: input.yamlPath,
    ...locateYamlPath(input.rawText, input.yamlPath),
    ...(input.affectedEntityId === undefined ? {} : { affectedEntityId: input.affectedEntityId })
  };
}

export function hasErrorDiagnostics(diagnostics: readonly QualityMapDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function graphStatusFromDiagnostics(
  diagnostics: readonly QualityMapDiagnostic[]
): "valid" | "partial" {
  return diagnostics.length === 0 ? "valid" : "partial";
}
