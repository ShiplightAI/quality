// Emitted from this package's own contract constants, like the other config
// schemas, so the published schema and the parser that enforces it cannot
// disagree. Before this existed the only copy lived in the agent skill, with
// nothing tying it to the parser — and it had already drifted ahead of it.
import { WHOLE_PROJECT_VIEW_ID } from "./types";

const nonEmptyString = { $ref: "#/definitions/nonEmptyString" } as const;

export function buildSavedViewsJsonSchema(): Record<string, unknown> {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://shiplight.dev/schemas/quality/views.schema.json",
    title: "Quality Saved Assessment Scopes",
    type: "object",
    additionalProperties: false,
    required: ["views"],
    properties: {
      views: {
        type: "array",
        minItems: 1,
        items: { $ref: "#/definitions/view" }
      }
    },
    definitions: {
      nonEmptyString: { type: "string", minLength: 1 },
      viewId: {
        type: "string",
        minLength: 1,
        // The scope shown when no view is selected. A saved view claiming it
        // would shadow the default scope everywhere it is used as an id.
        //
        // No shape rule beyond that: ids only reach filenames through the
        // recommendation export's own sanitizer, so a stricter pattern would
        // reject working configuration for no gain. That sanitizer can collide
        // on ids differing only in a separator — issue #16 — which a pattern
        // here would narrow but not fix, and would break existing configs to do.
        not: { const: WHOLE_PROJECT_VIEW_ID }
      },
      view: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "feature_ids"],
        properties: {
          id: { $ref: "#/definitions/viewId" },
          name: nonEmptyString,
          description: nonEmptyString,
          feature_ids: {
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: nonEmptyString
          }
        }
      }
    }
  };
}

export function serializeSavedViewsJsonSchema(): string {
  return `${JSON.stringify(buildSavedViewsJsonSchema(), null, 2)}\n`;
}
