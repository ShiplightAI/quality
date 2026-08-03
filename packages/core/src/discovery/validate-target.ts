import { stat } from "node:fs/promises";
import {
  createDiagnostic,
  type ScanDiagnostic
} from "../diagnostics/diagnostic";
import {
  displayNameForPath,
  isNonLocalPath,
  resolveLocalPath
} from "./path-policy";
import type { ProjectScanTarget } from "./types";

function invalidTarget(inputPath: string, diagnostic: ScanDiagnostic): ProjectScanTarget {
  return {
    inputPath,
    resolvedPath: "",
    displayName: "",
    validationStatus: "invalid",
    validationDiagnostic: diagnostic
  };
}

export async function validateScanTarget(inputPath: string): Promise<ProjectScanTarget> {
  const trimmedPath = inputPath.trim();

  if (trimmedPath.length === 0) {
    return invalidTarget(
      inputPath,
      createDiagnostic({
        severity: "error",
        code: "EMPTY_PATH",
        message: "Enter a local project directory path.",
        affectedPath: inputPath
      })
    );
  }

  if (isNonLocalPath(trimmedPath)) {
    return invalidTarget(
      inputPath,
      createDiagnostic({
        severity: "error",
        code: "NON_LOCAL_PATH",
        message: "Enter a local project directory path.",
        affectedPath: inputPath
      })
    );
  }

  const resolvedPath = resolveLocalPath(trimmedPath);

  try {
    const targetStats = await stat(resolvedPath);

    if (!targetStats.isDirectory()) {
      return invalidTarget(
        inputPath,
        createDiagnostic({
          severity: "error",
          code: "NON_DIRECTORY_TARGET",
          message: "Choose a project directory, not a file.",
          affectedPath: inputPath
        })
      );
    }

    return {
      inputPath,
      resolvedPath,
      displayName: displayNameForPath(resolvedPath),
      validationStatus: "valid"
    };
  } catch {
    return invalidTarget(
      inputPath,
      createDiagnostic({
        severity: "error",
        code: "MISSING_PATH",
        message: "The project path cannot be found.",
        affectedPath: inputPath
      })
    );
  }
}
