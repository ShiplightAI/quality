import { describe, expect, it } from "vitest";
import { locateYamlPath } from "@shiplightai/quality-map";

describe("YAML source location lookup", () => {
  const rawText = `schema_version: 1
target:
  id: "source-location"
  "meta.extra": "dotted key"
expectations:
  - id: "first"
    title: "First expectation"
    tasks:
      - id: "T001"
        title: "First task"
  - id: "second"
    title: "Second expectation"
    tasks:
      - id: "T002"
        title: "Second task"
    "weird[x]": "bracket key"
`;

  it("locates bracket-quoted map keys without treating dots as path separators", () => {
    expect(locateYamlPath(rawText, '$.target["meta.extra"]')).toMatchObject({
      line: 4,
      snippet: '"meta.extra": "dotted key"'
    });
  });

  it("locates repeated nested sequence records by index", () => {
    expect(locateYamlPath(rawText, "$.expectations[1].tasks[0].id")).toMatchObject({
      line: 14,
      snippet: '- id: "T002"'
    });
  });

  it("locates bracket-looking literal keys as literal map keys", () => {
    expect(locateYamlPath(rawText, '$.expectations[1]["weird[x]"]')).toMatchObject({
      line: 16,
      snippet: '"weird[x]": "bracket key"'
    });
  });
});
