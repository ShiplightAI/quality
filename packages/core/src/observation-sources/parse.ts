import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import type {
  GitHubActionsObservationSourceConfig,
  LocalFolderObservationSourceConfig,
  ObservationSourceProfile,
  ObservationSourceProfileDiagnostic,
  ObservationSourceProfileParseBatch,
  ObservationSourceProfileSource,
  ObservationSourceReference,
  ParsedObservationSourceProfiles,
  ParsedObservationSourceProfilesDocument
} from "./types";

const PROFILE_KEYS = new Set([
  "id",
  "name",
  "description",
  "transport",
  "observation_path",
  "source_refs",
  "auth",
  "github",
  "local_folder"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function diagnostic(
  source: ObservationSourceProfileSource,
  input: {
    readonly severity: ObservationSourceProfileDiagnostic["severity"];
    readonly code: string;
    readonly message: string;
    readonly yamlPath?: string;
  }
): ObservationSourceProfileDiagnostic {
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    profilePath: source.projectRelativePath,
    yamlPath: input.yamlPath ?? "$"
  };
}

function sourceRefs(value: unknown): readonly ObservationSourceReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const reference = {
      path: stringValue(item.path),
      url: stringValue(item.url),
      label: stringValue(item.label)
    };

    return reference.path === undefined && reference.url === undefined && reference.label === undefined
      ? []
      : [reference];
  });
}

function githubConfig(value: unknown): GitHubActionsObservationSourceConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const repo = stringValue(value.repo);
  const workflow = stringValue(value.workflow);
  const artifactNames = stringArray(value.artifact_names);
  if (repo === undefined || workflow === undefined || artifactNames.length === 0) {
    return undefined;
  }

  return {
    repo,
    workflow,
    artifactNames,
    branch: stringValue(value.branch)
  };
}

function localFolderConfig(value: unknown): LocalFolderObservationSourceConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const folderPath = stringValue(value.path);
  return folderPath === undefined ? undefined : { path: folderPath };
}

function validateProfile(
  profile: ObservationSourceProfile,
  source: ObservationSourceProfileSource,
  yamlPath: string,
  diagnostics: ObservationSourceProfileDiagnostic[]
): void {
  if (profile.transport === "github-actions" && profile.github === undefined) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: `Profile ${profile.id} requires a github block for transport github-actions.`,
        yamlPath: `${yamlPath}.github`
      })
    );
  }

  if (profile.transport === "local-folder" && profile.localFolder === undefined) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: `Profile ${profile.id} requires a local_folder block for transport local-folder.`,
        yamlPath: `${yamlPath}.local_folder`
      })
    );
  }
}

function profileFrom(
  value: unknown,
  source: ObservationSourceProfileSource,
  index: number,
  diagnostics: ObservationSourceProfileDiagnostic[]
): ObservationSourceProfile | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: `Profile entry ${index} must be a mapping.`,
        yamlPath: `$.profiles[${index}]`
      })
    );
    return undefined;
  }

  const diagnosticCountBeforeProfile = diagnostics.length;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const transport = stringValue(value.transport);
  const observationPath = stringValue(value.observation_path);
  const unknownKeys = Object.keys(value).filter((key) => !PROFILE_KEYS.has(key));
  if (unknownKeys.length > 0) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: `Profile entry ${index} contains unsupported fields: ${unknownKeys.join(", ")}.`,
        yamlPath: `$.profiles[${index}]`
      })
    );
  }

  if (id === undefined || name === undefined || (transport !== "github-actions" && transport !== "local-folder")) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: `Profile entry ${index} must include id, name, and a supported transport.`,
        yamlPath: `$.profiles[${index}]`
      })
    );
    return undefined;
  }
  if (observationPath === undefined) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: `Profile ${id} must define observation_path for its canonical quality-observations JSON file.`,
        yamlPath: `$.profiles[${index}].observation_path`
      })
    );
    return undefined;
  }

  const profile: ObservationSourceProfile = {
    id,
    name,
    description: stringValue(value.description),
    transport,
    observationPath,
    requiredEnv: stringArray(isRecord(value.auth) ? value.auth.required_env : undefined),
    sourceRefs: sourceRefs(value.source_refs),
    github: githubConfig(value.github),
    localFolder: localFolderConfig(value.local_folder)
  };

  validateProfile(profile, source, `$.profiles[${index}]`, diagnostics);
  if (diagnostics.slice(diagnosticCountBeforeProfile).some((entry) => entry.severity === "error")) {
    return undefined;
  }
  return profile;
}

function parseResultForSource(source: ObservationSourceProfileSource): ParsedObservationSourceProfiles {
  const rawText = readFileSync(source.resolvedLocalPath, "utf8");
  const diagnostics: ObservationSourceProfileDiagnostic[] = [];

  let documentValue: unknown;
  try {
    documentValue = parseDocument(rawText).toJSON();
  } catch (error) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: `Observation source profile YAML could not be parsed: ${error instanceof Error ? error.message : String(error)}`
      })
    );

    return {
      source,
      status: "invalid",
      rawText,
      diagnostics
    };
  }

  if (!isRecord(documentValue)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: "Observation source profiles must be a top-level mapping."
      })
    );

    return {
      source,
      status: "invalid",
      rawText,
      diagnostics
    };
  }

  if (!Array.isArray(documentValue.profiles)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE_PROFILE",
        message: "Observation source profiles must define a profiles array.",
        yamlPath: "$.profiles"
      })
    );

    return {
      source,
      status: "invalid",
      rawText,
      diagnostics
    };
  }

  const profiles = documentValue.profiles.flatMap((profile, index) => {
    const next = profileFrom(profile, source, index, diagnostics);
    return next === undefined ? [] : [next];
  });

  const seenProfileIds = new Set<string>();
  const duplicateProfileIds = new Set<string>();
  profiles.forEach((profile) => {
    if (seenProfileIds.has(profile.id)) {
      duplicateProfileIds.add(profile.id);
      return;
    }
    seenProfileIds.add(profile.id);
  });

  duplicateProfileIds.forEach((profileId) => {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "DUPLICATE_OBSERVATION_SOURCE_PROFILE_ID",
        message: `Profile id ${profileId} is defined more than once.`,
        yamlPath: "$.profiles"
      })
    );
  });

  const document: ParsedObservationSourceProfilesDocument = {
    profiles
  };

  return {
    source,
    status: diagnostics.some((entry) => entry.severity === "error") ? "invalid" : "parsed",
    rawText,
    document,
    diagnostics
  };
}

export function parseObservationSourceProfiles(
  sources: readonly ObservationSourceProfileSource[]
): ObservationSourceProfileParseBatch {
  const results = sources.map((source) => parseResultForSource(source));
  const primary = results[0];

  return {
    results,
    primary,
    diagnostics: results.flatMap((result) => result.diagnostics)
  };
}
