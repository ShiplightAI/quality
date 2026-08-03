import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import { parseDocument } from "yaml";
import { describe, expect, it } from "vitest";

async function loadJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadYaml(filePath: string): Promise<unknown> {
  return parseDocument(await readFile(filePath, "utf8")).toJSON();
}

describe("observation set schema contracts", () => {
  it("validates checked-in observation source examples against the canonical schema", async () => {
    const schemaPath = path.join(
      process.cwd(),
      "packages/core/src/observation-sources/observation-sources.schema.json"
    );
    const schema = await loadJson(schemaPath);
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);

    const examplePaths = [
      path.join(
        process.cwd(),
        "tests/fixtures/quality-projects/complete/.quality/config/observation-sources.yaml"
      )
    ];

    for (const examplePath of examplePaths) {
      const document = await loadYaml(examplePath);
      const valid = validate(document);
      expect(valid, `${examplePath}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    }

    const invalidDocument = {
      profiles: [
        {
          id: "missing-transport",
          name: "Missing transport",
          observation_path: "quality-observations.json"
        }
      ]
    };

    expect(validate(invalidDocument)).toBe(false);
  });

  it("validates checked-in observation set examples against the canonical schema", async () => {
    const schemaPath = path.join(
      process.cwd(),
      "packages/core/src/observation-sets/observation-sets.schema.json"
    );
    const schema = await loadJson(schemaPath);
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);

    const examplePaths = [
      path.join(
        process.cwd(),
        "tests/fixtures/quality-projects/complete/.quality/config/observation-sets.yaml"
      )
    ];

    for (const examplePath of examplePaths) {
      const document = await loadYaml(examplePath);
      const valid = validate(document);
      expect(valid, `${examplePath}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    }

    const invalidDocument = {
      observation_sets: [
        {
          id: "missing-profiles",
          name: "Missing profiles"
        }
      ]
    };

    expect(validate(invalidDocument)).toBe(false);
  });
});
