// Emitted from this package's own contract constants, like the observation
// manifest and source-profile schemas, so the published schema and the parser
// that enforces it cannot disagree. The checked-in JSON beside this module is
// generated from here and asserted equal in tests.
import { RESERVED_OBSERVATION_SET_ID } from "./types";

const nonEmptyString = { $ref: "#/definitions/nonEmptyString" } as const;

// Matched case-insensitively because YAML authors write ids in whatever case
// they like, and the parser lowercases before comparing.
function caseInsensitivePattern(value: string): string {
  return `^${[...value].map((c) => `[${c.toUpperCase()}${c.toLowerCase()}]`).join("")}$`;
}

export function buildObservationSetsJsonSchema(): Record<string, unknown> {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://shiplight.dev/schemas/quality/observation-sets.schema.json",
    title: "Quality Observation Sets",
    type: "object",
    additionalProperties: false,
    required: ["observation_sets"],
    properties: {
      observation_sets: {
        type: "array",
        minItems: 1,
        items: { $ref: "#/definitions/observationSet" }
      }
    },
    definitions: {
      nonEmptyString: { type: "string", minLength: 1 },
      profileReference: {
        type: "object",
        additionalProperties: false,
        required: ["profile_id"],
        properties: { profile_id: nonEmptyString }
      },
      observationSet: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "profiles"],
        properties: {
          id: {
            allOf: [
              nonEmptyString,
              // `static` names the assessment that has no runtime observations
              // at all, so a set claiming it would shadow that scope.
              { not: { pattern: caseInsensitivePattern(RESERVED_OBSERVATION_SET_ID) } }
            ]
          },
          name: nonEmptyString,
          description: nonEmptyString,
          profiles: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: { $ref: "#/definitions/profileReference" }
          }
        }
      }
    }
  };
}

export function serializeObservationSetsJsonSchema(): string {
  return `${JSON.stringify(buildObservationSetsJsonSchema(), null, 2)}\n`;
}
