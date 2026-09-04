// Emitted from this package's own contract constants, exactly like the
// canonical observation manifest schema, so the published schema and the parser
// that enforces it cannot disagree. The checked-in JSON file beside this module
// is generated from here and asserted equal in tests.
import { OBSERVATION_SOURCE_TRANSPORTS } from "./types";

const nonEmptyString = { $ref: "#/definitions/nonEmptyString" } as const;

function transportRequires(
  transport: string,
  required: readonly string[]
): Record<string, unknown> {
  return {
    if: { properties: { transport: { const: transport } } },
    then: { required: [...required] }
  };
}

export function buildObservationSourceProfilesJsonSchema(): Record<string, unknown> {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://shiplight.dev/schemas/quality/observation-sources.schema.json",
    title: "Quality Observation Source Profiles",
    type: "object",
    additionalProperties: false,
    required: ["profiles"],
    properties: {
      profiles: {
        type: "array",
        minItems: 1,
        items: { $ref: "#/definitions/profile" }
      }
    },
    definitions: {
      nonEmptyString: { type: "string", minLength: 1 },
      sourceRef: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: { path: nonEmptyString, url: nonEmptyString, label: nonEmptyString }
      },
      auth: {
        type: "object",
        additionalProperties: false,
        properties: { required_env: { type: "array", items: nonEmptyString } }
      },
      github: {
        type: "object",
        additionalProperties: false,
        required: ["repo", "workflow", "artifact_names"],
        properties: {
          repo: nonEmptyString,
          workflow: nonEmptyString,
          artifact_names: { type: "array", minItems: 1, items: nonEmptyString },
          branch: nonEmptyString
        }
      },
      localFolder: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: { path: nonEmptyString }
      },
      host: {
        type: "object",
        additionalProperties: false,
        required: ["provider"],
        properties: {
          provider: nonEmptyString,
          // Values are strings so config stays a flat, reviewable block rather
          // than a place to smuggle structure past a reader.
          options: { type: "object", additionalProperties: nonEmptyString }
        }
      },
      profile: {
        type: "object",
        additionalProperties: false,
        // `observation_path` is required per-transport below, not here: a host
        // transport addresses no file.
        required: ["id", "name", "transport"],
        properties: {
          id: nonEmptyString,
          name: nonEmptyString,
          description: nonEmptyString,
          transport: { enum: [...OBSERVATION_SOURCE_TRANSPORTS] },
          observation_path: nonEmptyString,
          source_refs: { type: "array", items: { $ref: "#/definitions/sourceRef" } },
          auth: { $ref: "#/definitions/auth" },
          github: { $ref: "#/definitions/github" },
          local_folder: { $ref: "#/definitions/localFolder" },
          host: { $ref: "#/definitions/host" }
        },
        allOf: [
          transportRequires("github-actions", ["github", "observation_path"]),
          transportRequires("local-folder", ["local_folder", "observation_path"]),
          transportRequires("host", ["host"])
        ]
      }
    }
  };
}

export function serializeObservationSourceProfilesJsonSchema(): string {
  return `${JSON.stringify(buildObservationSourceProfilesJsonSchema(), null, 2)}\n`;
}
