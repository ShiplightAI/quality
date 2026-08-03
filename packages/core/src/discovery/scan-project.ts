import { existsSync } from "node:fs";
import path from "node:path";
import {
  createDiagnostic,
  hasWarningDiagnostic,
  type ScanDiagnostic
} from "../diagnostics/diagnostic";
import {
  parseObservationSets,
  type ObservationSetSource
} from "../observation-sets";
import {
  parseObservationSourceProfiles,
  type ObservationSourceProfileSource
} from "../observation-sources";
import { parseQualityMaps, type QualityMapSource } from "@shiplightai/quality-map";
import { parseProjectMaps, type ProjectMapSource } from "../project-map";
import { parseHumanSources } from "../sources/parse";
import { invalidSavedViewFeatureDiagnostics } from "../views";
import {
  parseSavedQcViews,
  type SavedQcViewSource
} from "../views/server";
import { findArtifacts } from "./find-artifacts";
import { buildMarkdownFallbackBatch } from "../markdown-fallback/normalize-fallback";
import type { MarkdownArtifactSource } from "../markdown-fallback/types";
import { createTargetCandidates } from "./target-candidate";
import { validateScanTarget } from "./validate-target";
import type { DiscoveredArtifact } from "./types";
import type { ScanMode, ScanResult } from "./types";

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function canonicalRepoRelativePath(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    normalized.startsWith("/") ||
    isWindowsAbsolutePath(value) ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    return undefined;
  }

  return normalized;
}

function evidencePathExistenceDiagnostics(input: {
  readonly projectRoot: string;
  readonly qualityMaps: ReturnType<typeof parseQualityMaps>;
}): readonly ScanDiagnostic[] {
  const diagnostics: ScanDiagnostic[] = [];

  input.qualityMaps.results.forEach((result) => {
    result.graph?.evidence.forEach((evidence) => {
      const canonicalPath = canonicalRepoRelativePath(evidence.path);
      if (canonicalPath === undefined) {
        return;
      }

      const resolvedPath = path.resolve(input.projectRoot, canonicalPath);
      if (existsSync(resolvedPath)) {
        return;
      }

      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "MISSING_EVIDENCE_FILE",
          message: `Evidence path ${canonicalPath} referenced by ${evidence.localId} does not exist in the scanned repo.`,
          affectedPath: result.source.projectRelativePath
        })
      );
    });
  });

  return diagnostics;
}

export interface ScanProjectInput {
  readonly projectPath: string;
  readonly mode?: ScanMode;
}

function timestamp(): string {
  return new Date().toISOString();
}

function failedResult(inputPath: string, diagnostics: readonly ScanDiagnostic[]): ScanResult {
  const now = timestamp();

  return {
    status: "failed",
    target: {
      inputPath,
      resolvedPath: "",
      displayName: "",
      validationStatus: "invalid",
      validationDiagnostic: diagnostics[0]
    },
    artifacts: [],
    projectMaps: {
      results: [],
      diagnostics: []
    },
    views: {
      results: [],
      diagnostics: []
    },
    sources: {
      diagnostics: []
    },
    qualityMaps: {
      results: [],
      diagnostics: []
    },
    observationSourceProfiles: {
      results: [],
      diagnostics: []
    },
    observationSets: {
      results: [],
      diagnostics: []
    },
    markdownFallback: {
      fallbackTargets: [],
      supplementalNarratives: [],
      parsedArtifacts: [],
      diagnostics: []
    },
    targetCandidates: [],
    diagnostics,
    startedAt: now,
    completedAt: now
  };
}

function qualityMapSourceFromArtifact(artifact: DiscoveredArtifact): QualityMapSource {
  return {
    projectRelativePath: artifact.projectRelativePath,
    resolvedLocalPath: artifact.resolvedPath,
    targetCandidateId: artifact.targetLocation,
    sourcePattern: artifact.sourcePattern
  };
}

function projectMapSourceFromArtifact(artifact: DiscoveredArtifact): ProjectMapSource {
  return {
    projectRelativePath: artifact.projectRelativePath,
    resolvedLocalPath: artifact.resolvedPath,
    sourcePattern: artifact.sourcePattern
  };
}

function savedViewSourceFromArtifact(artifact: DiscoveredArtifact): SavedQcViewSource {
  return {
    projectRelativePath: artifact.projectRelativePath,
    resolvedLocalPath: artifact.resolvedPath,
    sourcePattern: artifact.sourcePattern
  };
}

function observationSourceProfileSourceFromArtifact(
  artifact: DiscoveredArtifact
): ObservationSourceProfileSource {
  return {
    projectRelativePath: artifact.projectRelativePath,
    resolvedLocalPath: artifact.resolvedPath,
    sourcePattern: artifact.sourcePattern
  };
}

function observationSetSourceFromArtifact(artifact: DiscoveredArtifact): ObservationSetSource {
  return {
    projectRelativePath: artifact.projectRelativePath,
    resolvedLocalPath: artifact.resolvedPath,
    sourcePattern: artifact.sourcePattern
  };
}

function markdownSourceFromArtifact(artifact: DiscoveredArtifact): MarkdownArtifactSource {
  return {
    artifactType: artifact.kind === "test_spec" ? "test_spec" : "test_report",
    projectRelativePath: artifact.projectRelativePath,
    resolvedLocalPath: artifact.resolvedPath,
    targetCandidateId: artifact.targetLocation,
    sourcePattern: artifact.sourcePattern
  };
}

function shouldReportNoArtifacts(diagnostics: readonly ScanDiagnostic[]): boolean {
  return !diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "UNREADABLE_ARTIFACT_FILE" ||
      diagnostic.code === "OUT_OF_PROJECT_ARTIFACT"
  );
}

function observationSetReferenceDiagnostics(input: {
  readonly profileIds: readonly string[];
  readonly observationSets: ReturnType<typeof parseObservationSets>;
}): readonly ScanDiagnostic[] {
  const knownProfileIds = new Set(input.profileIds);
  const diagnostics: ScanDiagnostic[] = [];

  input.observationSets.results.forEach((result) => {
    result.document?.observationSets.forEach((observationSet) => {
      observationSet.profiles.forEach((profileRef) => {
        if (knownProfileIds.has(profileRef.profileId)) {
          return;
        }

        diagnostics.push(
          createDiagnostic({
            severity: "warning",
            code: "UNKNOWN_OBSERVATION_SET_PROFILE",
            message: `Observation set ${observationSet.id} references unknown observation source profile ${profileRef.profileId}.`,
            affectedPath: result.source.projectRelativePath
          })
        );
      });
    });
  });

  return diagnostics;
}

export async function scanProject(input: ScanProjectInput): Promise<ScanResult> {
  const startedAt = timestamp();
  const target = await validateScanTarget(input.projectPath);

  if (target.validationStatus === "invalid") {
    const diagnostic = target.validationDiagnostic;
    if (diagnostic === undefined) {
      throw new Error("Invalid scan target must include a diagnostic.");
    }

    if (input.mode === "refresh") {
      return failedResult(input.projectPath, [
        diagnostic,
        createDiagnostic({
          severity: "error",
          code: "FAILED_REFRESH",
          message: "Refresh failed. The previous successful result remains visible.",
          affectedPath: input.projectPath
        })
      ]);
    }

    return failedResult(input.projectPath, [diagnostic]);
  }

  const discovery = await findArtifacts(target);
  const diagnostics = [...discovery.diagnostics];
  const projectMaps = parseProjectMaps(
    discovery.artifacts
      .filter((artifact) => artifact.kind === "project_map")
      .map(projectMapSourceFromArtifact)
  );
  const views = parseSavedQcViews(
    discovery.artifacts
      .filter((artifact) => artifact.kind === "views")
      .map(savedViewSourceFromArtifact)
  );
  const qualityMaps = parseQualityMaps(
    discovery.artifacts
      .filter((artifact) => artifact.kind === "quality_map")
      .map(qualityMapSourceFromArtifact)
  );
  const observationSourceProfiles = parseObservationSourceProfiles(
    discovery.artifacts
      .filter((artifact) => artifact.kind === "observation_sources")
      .map(observationSourceProfileSourceFromArtifact)
  );
  const observationSets = parseObservationSets(
    discovery.artifacts
      .filter((artifact) => artifact.kind === "observation_sets")
      .map(observationSetSourceFromArtifact)
  );
  const markdownFallback = buildMarkdownFallbackBatch({
    sources: discovery.artifacts
      .filter((artifact) => artifact.kind === "test_spec" || artifact.kind === "test_report")
      .map(markdownSourceFromArtifact),
    qualityMaps
  });
  // Human-sources layer lives at a fixed config path (not a discovered artifact);
  // a missing file parses to an empty document.
  const parsedSources = parseHumanSources({
    projectRelativePath: ".quality/config/sources.yaml",
    resolvedLocalPath: path.join(target.resolvedPath, ".quality", "config", "sources.yaml")
  });
  const sources = {
    primary: parsedSources.document === undefined ? undefined : parsedSources,
    diagnostics: parsedSources.diagnostics
  };
  diagnostics.push(
    ...invalidSavedViewFeatureDiagnostics({
      views,
      projectMap: projectMaps.primary?.map
    }),
    ...evidencePathExistenceDiagnostics({
      projectRoot: target.resolvedPath,
      qualityMaps
    }),
    ...observationSetReferenceDiagnostics({
      profileIds: observationSourceProfiles.primary?.document?.profiles.map((profile) => profile.id) ?? [],
      observationSets
    })
  );

  if (discovery.artifacts.length === 0 && shouldReportNoArtifacts(diagnostics)) {
    diagnostics.push(
      createDiagnostic({
        severity: "info",
        code: "NO_ARTIFACTS_FOUND",
        message: "No supported quality artifacts were found.",
        affectedPath: "."
      })
    );
  }

  return {
    status: hasWarningDiagnostic(diagnostics) ? "partial" : "completed",
    target,
    artifacts: discovery.artifacts,
    projectMaps,
    views,
    sources,
    qualityMaps,
    observationSourceProfiles,
    observationSets,
    markdownFallback,
    targetCandidates: createTargetCandidates(discovery.artifacts),
    diagnostics,
    startedAt,
    completedAt: timestamp()
  };
}
