import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import type {
  ObservationSet,
  ObservationSetDiagnostic,
  ObservationSetParseBatch,
  ObservationSetProfileReference,
  ObservationSetSource,
  ParsedObservationSets,
  ParsedObservationSetsDocument
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function diagnostic(
  source: ObservationSetSource,
  input: {
    readonly severity: ObservationSetDiagnostic["severity"];
    readonly code: string;
    readonly message: string;
    readonly yamlPath?: string;
  }
): ObservationSetDiagnostic {
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    observationSetPath: source.projectRelativePath,
    yamlPath: input.yamlPath ?? "$"
  };
}

function profiles(
  value: unknown,
  source: ObservationSetSource,
  yamlPath: string,
  diagnostics: ObservationSetDiagnostic[]
): readonly ObservationSetProfileReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: ObservationSetProfileReference[] = [];
  const seenProfileIds = new Set<string>();

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      diagnostics.push(
        diagnostic(source, {
          severity: "error",
          code: "INVALID_OBSERVATION_SET",
          message: `Observation set profile entry ${index} must be a mapping.`,
          yamlPath: `${yamlPath}[${index}]`
        })
      );
      return;
    }

    const profileId = stringValue(item.profile_id);
    if (profileId === undefined) {
      diagnostics.push(
        diagnostic(source, {
          severity: "error",
          code: "INVALID_OBSERVATION_SET",
          message: `Observation set profile entry ${index} must include profile_id.`,
          yamlPath: `${yamlPath}[${index}].profile_id`
        })
      );
      return;
    }

    if (seenProfileIds.has(profileId)) {
      diagnostics.push(
        diagnostic(source, {
          severity: "error",
          code: "DUPLICATE_OBSERVATION_SET_PROFILE_ID",
          message: `Profile id ${profileId} is referenced more than once within the same observation set.`,
          yamlPath
        })
      );
      return;
    }

    seenProfileIds.add(profileId);
    parsed.push({ profileId });
  });

  return parsed;
}

function observationSetFrom(
  value: unknown,
  source: ObservationSetSource,
  index: number,
  diagnostics: ObservationSetDiagnostic[]
): ObservationSet | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SET",
        message: `Observation set entry ${index} must be a mapping.`,
        yamlPath: `$.observation_sets[${index}]`
      })
    );
    return undefined;
  }

  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const setProfiles = profiles(value.profiles, source, `$.observation_sets[${index}].profiles`, diagnostics);

  if (id === undefined || name === undefined) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SET",
        message: `Observation set entry ${index} must include id and name.`,
        yamlPath: `$.observation_sets[${index}]`
      })
    );
    return undefined;
  }

  if (id.toLowerCase() === "static") {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "RESERVED_OBSERVATION_SET_ID",
        message: "Observation set id static is reserved for assessments without runtime observations.",
        yamlPath: `$.observation_sets[${index}].id`
      })
    );
    return undefined;
  }

  if (setProfiles.length === 0) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SET",
        message: `Observation set ${id} must reference at least one observation source profile.`,
        yamlPath: `$.observation_sets[${index}].profiles`
      })
    );
  }

  return {
    id,
    name,
    description: stringValue(value.description),
    profiles: setProfiles
  };
}

function parseResultForSource(source: ObservationSetSource): ParsedObservationSets {
  const rawText = readFileSync(source.resolvedLocalPath, "utf8");
  const diagnostics: ObservationSetDiagnostic[] = [];

  let documentValue: unknown;
  try {
    documentValue = parseDocument(rawText).toJSON();
  } catch (error) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SET",
        message: `Observation set YAML could not be parsed: ${error instanceof Error ? error.message : String(error)}`
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
        code: "INVALID_OBSERVATION_SET",
        message: "Observation sets must be a top-level mapping."
      })
    );

    return {
      source,
      status: "invalid",
      rawText,
      diagnostics
    };
  }

  if (!Array.isArray(documentValue.observation_sets)) {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "INVALID_OBSERVATION_SET",
        message: "Observation sets must define an observation_sets array.",
        yamlPath: "$.observation_sets"
      })
    );

    return {
      source,
      status: "invalid",
      rawText,
      diagnostics
    };
  }

  const observationSets = documentValue.observation_sets.flatMap((entry, index) => {
    const next = observationSetFrom(entry, source, index, diagnostics);
    return next === undefined ? [] : [next];
  });

  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  observationSets.forEach((observationSet) => {
    if (seenIds.has(observationSet.id)) {
      duplicateIds.add(observationSet.id);
      return;
    }
    seenIds.add(observationSet.id);
  });

  duplicateIds.forEach((setId) => {
    diagnostics.push(
      diagnostic(source, {
        severity: "error",
        code: "DUPLICATE_OBSERVATION_SET_ID",
        message: `Observation set id ${setId} is defined more than once.`,
        yamlPath: "$.observation_sets"
      })
    );
  });

  const document: ParsedObservationSetsDocument = {
    observationSets
  };

  return {
    source,
    status: diagnostics.some((entry) => entry.severity === "error") ? "invalid" : "parsed",
    rawText,
    document,
    diagnostics
  };
}

export function parseObservationSets(
  sources: readonly ObservationSetSource[]
): ObservationSetParseBatch {
  const results = sources.map((source) => parseResultForSource(source));
  const primary = results[0];

  return {
    results,
    primary,
    diagnostics: results.flatMap((result) => result.diagnostics)
  };
}

export function findObservationSet(
  batch: ObservationSetParseBatch,
  setId: string
): ObservationSet | undefined {
  return batch.primary?.document?.observationSets.find((entry) => entry.id === setId);
}
