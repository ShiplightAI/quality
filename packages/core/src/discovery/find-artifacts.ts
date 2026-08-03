import { constants } from "node:fs";
import { access, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  createDiagnostic,
  type ScanDiagnostic
} from "../diagnostics/diagnostic";
import { createDiscoveredArtifact } from "./artifact";
import { toProjectRelativePath } from "./path-policy";
import { supportedArtifactPatterns, type SupportedArtifactPattern } from "./scan-patterns";
import type { DiscoveredArtifact, ProjectScanTarget } from "./types";

export interface FindArtifactsResult {
  readonly artifacts: readonly DiscoveredArtifact[];
  readonly diagnostics: readonly ScanDiagnostic[];
}

interface CandidateParent {
  readonly resolvedPath: string;
  readonly projectRelativePath: string;
}

const PARENT_PATTERN_RANK: Record<SupportedArtifactPattern["parentPattern"], number> = {
  ".quality": 0, // project index first
  ".quality/config": 1, // runtime-review wiring
  ".quality/evidence/*": 2, // per-feature quality maps
  "specs/*": 3 // dev-bundle test artifacts
};

function orderedPatterns(): readonly SupportedArtifactPattern[] {
  return [...supportedArtifactPatterns].toSorted((left, right) => {
    if (left.parentPattern === right.parentPattern) {
      return left.fileName.localeCompare(right.fileName);
    }
    return PARENT_PATTERN_RANK[left.parentPattern] - PARENT_PATTERN_RANK[right.parentPattern];
  });
}

async function statIfPresent(resolvedPath: string): Promise<"missing" | "directory" | "file" | "other"> {
  try {
    const entryStats = await stat(resolvedPath);
    if (entryStats.isDirectory()) {
      return "directory";
    }
    if (entryStats.isFile()) {
      return "file";
    }
    return "other";
  } catch {
    return "missing";
  }
}

async function exactParent(
  target: ProjectScanTarget,
  relativePath: string,
  diagnostics: ScanDiagnostic[]
): Promise<readonly CandidateParent[]> {
  const resolvedPath = path.join(target.resolvedPath, relativePath);
  const entryKind = await statIfPresent(resolvedPath);

  if (entryKind === "missing") {
    return [];
  }

  if (entryKind !== "directory") {
    return [];
  }

  try {
    await access(resolvedPath, constants.R_OK | constants.X_OK);
    return [{ resolvedPath, projectRelativePath: relativePath }];
  } catch {
    diagnostics.push(
      createDiagnostic({
        severity: "warning",
        code: "UNREADABLE_DIRECTORY",
        message: `The directory ${relativePath} could not be read; readable locations were still scanned.`,
        affectedPath: relativePath
      })
    );
    return [];
  }
}

async function wildcardParents(
  target: ProjectScanTarget,
  rootRelativePath: ".quality/evidence" | "specs",
  diagnostics: ScanDiagnostic[]
): Promise<readonly CandidateParent[]> {
  const rootPath = path.join(target.resolvedPath, rootRelativePath);
  const entryKind = await statIfPresent(rootPath);

  if (entryKind === "missing") {
    return [];
  }

  if (entryKind !== "directory") {
    return [];
  }

  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    const parents: CandidateParent[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const resolvedPath = path.join(rootPath, entry.name);
      const projectRelativePath = `${rootRelativePath}/${entry.name}`;

      try {
        await access(resolvedPath, constants.R_OK | constants.X_OK);
        parents.push({ resolvedPath, projectRelativePath });
      } catch {
        diagnostics.push(
          createDiagnostic({
            severity: "warning",
            code: "UNREADABLE_DIRECTORY",
            message: `The directory ${projectRelativePath} could not be read; readable locations were still scanned.`,
            affectedPath: projectRelativePath
          })
        );
      }
    }

    return parents;
  } catch {
    diagnostics.push(
      createDiagnostic({
        severity: "warning",
        code: "UNREADABLE_DIRECTORY",
        message: `The directory ${rootRelativePath} could not be read; readable locations were still scanned.`,
        affectedPath: rootRelativePath
      })
    );
    return [];
  }
}

async function parentsForPattern(
  target: ProjectScanTarget,
  pattern: SupportedArtifactPattern,
  diagnostics: ScanDiagnostic[]
): Promise<readonly CandidateParent[]> {
  if (pattern.parentPattern === ".quality") {
    return exactParent(target, ".quality", diagnostics);
  }

  if (pattern.parentPattern === ".quality/config") {
    return exactParent(target, ".quality/config", diagnostics);
  }

  if (pattern.parentPattern === ".quality/evidence/*") {
    return wildcardParents(target, ".quality/evidence", diagnostics);
  }

  return wildcardParents(target, "specs", diagnostics);
}

async function canonicalPathForArtifact(
  resolvedPath: string,
  projectRelativePath: string,
  diagnostics: ScanDiagnostic[]
): Promise<string | null> {
  try {
    return await realpath(resolvedPath);
  } catch {
    diagnostics.push(
      createDiagnostic({
        severity: "warning",
        code: "UNREADABLE_ARTIFACT_FILE",
        message: `The artifact ${projectRelativePath} could not be read; readable artifacts were still returned.`,
        affectedPath: projectRelativePath
      })
    );
    return null;
  }
}

async function canonicalProjectRoot(target: ProjectScanTarget): Promise<string> {
  try {
    return await realpath(target.resolvedPath);
  } catch {
    return target.resolvedPath;
  }
}

export async function findArtifacts(
  target: ProjectScanTarget
): Promise<FindArtifactsResult> {
  const artifacts: DiscoveredArtifact[] = [];
  const diagnostics: ScanDiagnostic[] = [];
  const projectCanonicalPath = await canonicalProjectRoot(target);
  const seenProjectRelativePaths = new Map<string, "included" | "skipped">();
  const seenCanonicalPaths = new Set<string>();

  for (const pattern of orderedPatterns()) {
    const candidateParents = await parentsForPattern(target, pattern, diagnostics);

    for (const parent of candidateParents) {
      const resolvedPath = path.join(parent.resolvedPath, pattern.fileName);
      const projectRelativePath = toProjectRelativePath(target.resolvedPath, resolvedPath);

      if (projectRelativePath === null) {
        continue;
      }

      const existingMatch = seenProjectRelativePaths.get(projectRelativePath);
      if (existingMatch !== undefined) {
        if (existingMatch === "included") {
          diagnostics.push(
            createDiagnostic({
              severity: "info",
              code: "DUPLICATE_ARTIFACT_MATCH",
              message: `The artifact ${projectRelativePath} matched more than one supported pattern and was shown once.`,
              affectedPath: projectRelativePath
            })
          );
        }
        continue;
      }

      const entryKind = await statIfPresent(resolvedPath);

      if (entryKind === "missing") {
        continue;
      }

      if (entryKind !== "file") {
        seenProjectRelativePaths.set(projectRelativePath, "skipped");
        continue;
      }

      try {
        await access(resolvedPath, constants.R_OK);
      } catch {
        diagnostics.push(
          createDiagnostic({
            severity: "warning",
            code: "UNREADABLE_ARTIFACT_FILE",
            message: `The artifact ${projectRelativePath} could not be read; readable artifacts were still returned.`,
            affectedPath: projectRelativePath
          })
        );
        seenProjectRelativePaths.set(projectRelativePath, "skipped");
        continue;
      }

      const canonicalPath = await canonicalPathForArtifact(
        resolvedPath,
        projectRelativePath,
        diagnostics
      );

      if (canonicalPath === null) {
        seenProjectRelativePaths.set(projectRelativePath, "skipped");
        continue;
      }

      if (toProjectRelativePath(projectCanonicalPath, canonicalPath) === null) {
        diagnostics.push(
          createDiagnostic({
            severity: "warning",
            code: "OUT_OF_PROJECT_ARTIFACT",
            message: `The artifact ${projectRelativePath} resolves outside the selected project and was skipped.`,
            affectedPath: projectRelativePath
          })
        );
        seenProjectRelativePaths.set(projectRelativePath, "skipped");
        continue;
      }

      if (seenCanonicalPaths.has(canonicalPath)) {
        diagnostics.push(
          createDiagnostic({
            severity: "info",
            code: "DUPLICATE_ARTIFACT_MATCH",
            message: `The artifact ${projectRelativePath} matched more than one supported pattern and was shown once.`,
            affectedPath: projectRelativePath
          })
        );
        continue;
      }

      seenCanonicalPaths.add(canonicalPath);
      seenProjectRelativePaths.set(projectRelativePath, "included");
      artifacts.push(
        createDiscoveredArtifact({
          kind: pattern.kind,
          projectRelativePath,
          resolvedPath,
          sourcePattern: pattern.sourcePattern
        })
      );
    }
  }

  return {
    artifacts: artifacts.toSorted((left, right) =>
      left.projectRelativePath.localeCompare(right.projectRelativePath)
    ),
    diagnostics
  };
}
