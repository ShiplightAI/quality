import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  normalizeQualityMap,
  parseQualityMap,
  parseQualityMaps,
  validateQualityMap
} from "@shiplightai/quality-map";
import { fixtureQualityMapSource } from "../fixtures/quality-map/build-fixtures";

describe("quality-map package contract", () => {
  it("parses and normalizes complete and minimal structural quality maps", () => {
    const complete = parseQualityMaps([
      fixtureQualityMapSource("complete/quality-map.yaml"),
      fixtureQualityMapSource("minimal/quality-map.yaml")
    ]);

    expect(complete.results).toHaveLength(2);
    expect(complete.results.every((result) => result.status === "valid")).toBe(true);

    const completeGraph = complete.results[0]?.graph;
    expect(completeGraph?.target.localId).toBe("checkout-quality");
    expect(completeGraph?.expectations).toHaveLength(2);
    expect(completeGraph?.tasks).toHaveLength(2);
    expect(completeGraph?.evidence).toHaveLength(2);
    expect(completeGraph?.residualRisks).toHaveLength(2);
    expect(completeGraph?.evidence.map((evidence) => evidence.contexts)).toEqual([
      ["pr-ci", "release-gate"],
      ["local", "manual-review"]
    ]);

    const minimalGraph = complete.results[1]?.graph;
    expect(minimalGraph?.expectations).toHaveLength(1);
    expect(minimalGraph?.tasks).toEqual([]);
    expect(minimalGraph?.evidence).toEqual([]);
    expect(minimalGraph?.residualRisks).toEqual([]);
  });

  it("returns blocking diagnostics for invalid YAML and structural shape errors", () => {
    const invalidYaml = parseQualityMaps([
      fixtureQualityMapSource("invalid/invalid-yaml.yaml"),
      fixtureQualityMapSource("invalid/wrong-shape.yaml")
    ]);

    expect(invalidYaml.results.map((result) => result.status)).toEqual(["invalid", "invalid"]);
    expect(invalidYaml.results[0]?.graph).toBeUndefined();
    expect(invalidYaml.results[0]?.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "INVALID_YAML",
        mapPath: "invalid/invalid-yaml.yaml",
        yamlPath: "$"
      })
    );
    expect(invalidYaml.results[1]?.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "INVALID_FIELD_SHAPE",
        yamlPath: "$.expectations"
      })
    );
  });

  it("keeps valid maps independent from invalid maps in the same batch", () => {
    const batch = parseQualityMaps([
      fixtureQualityMapSource("mixed/valid-quality-map.yaml"),
      fixtureQualityMapSource("mixed/invalid-quality-map.yaml")
    ]);

    expect(batch.results.map((result) => result.status)).toEqual(["valid", "invalid"]);
    expect(batch.results[0]?.graph?.target.localId).toBe("mixed-valid");
    expect(batch.results[1]?.graph).toBeUndefined();
    expect(batch.diagnostics.some((diagnostic) => diagnostic.mapPath === "mixed/invalid-quality-map.yaml")).toBe(
      true
    );
  });

  it("reports non-blocking unknown fields while preserving supported graph data", () => {
    const result = parseQualityMaps([fixtureQualityMapSource("invalid/unknown-field.yaml")])
      .results[0];

    expect(result?.status).toBe("partial");
    expect(result?.graph?.expectations.map((expectation) => expectation.localId)).toEqual([
      "known-expectation"
    ]);
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "warning", code: "UNKNOWN_FIELD", yamlPath: "$.future_top_level" }),
        expect.objectContaining({
          severity: "warning",
          code: "UNKNOWN_FIELD",
          yamlPath: "$.expectations[0].future_expectation_field"
        })
      ])
    );
  });

  it("treats unusual unknown field names as warnings instead of parse failures", () => {
    const result = parseQualityMaps([fixtureQualityMapSource("invalid/unknown-field-metachar.yaml")])
      .results[0];

    expect(result?.status).toBe("partial");
    expect(result?.graph?.expectations.map((expectation) => expectation.localId)).toEqual([
      "known-expectation"
    ]);
    expect(result?.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "QUALITY_MAP_PARSE_FAILED"
    );
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "UNKNOWN_FIELD",
          yamlPath: '$.expectations[0]["weird(field"]',
          snippet: '"weird(field": "ignored with warning"'
        }),
        expect.objectContaining({
          severity: "warning",
          code: "UNKNOWN_FIELD",
          yamlPath: '$.expectations[0]["weird[x]"]',
          snippet: '"weird[x]": "ignored bracketed key"'
        }),
        expect.objectContaining({
          severity: "warning",
          code: "UNKNOWN_FIELD",
          yamlPath: '$.target[""]',
          snippet: '"": "ignored empty key"'
        }),
        expect.objectContaining({
          severity: "warning",
          code: "UNKNOWN_FIELD",
          yamlPath: '$.target["meta.extra"]',
          snippet: '"meta.extra": "ignored dotted key"'
        })
      ])
    );
  });

  it("warns when evidence paths are not canonical repo-relative file paths", () => {
    const result = parseQualityMaps([fixtureQualityMapSource("invalid/non-canonical-evidence-path.yaml")])
      .results[0];

    expect(result?.status).toBe("partial");
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "NON_CANONICAL_EVIDENCE_PATH",
          yamlPath: "$.expectations[0].evidence[0].path"
        }),
        expect.objectContaining({
          severity: "warning",
          code: "NON_CANONICAL_EVIDENCE_PATH",
          yamlPath: "$.expectations[0].evidence[1].path"
        }),
        expect.objectContaining({
          severity: "warning",
          code: "NON_CANONICAL_EVIDENCE_PATH",
          yamlPath: "$.expectations[0].evidence[2].path"
        })
      ])
    );
    expect(result?.graph?.evidence[0]?.path).toBe("packages/sdk-core/tests/specs/engine-fixture.spec.ts");
  });

  it("omits duplicate entities and dependent relationships without dropping coherent data", () => {
    const result = parseQualityMaps([fixtureQualityMapSource("invalid/duplicate-ids.yaml")])
      .results[0];

    expect(result?.status).toBe("partial");
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "DUPLICATE_ENTITY_ID",
          affectedEntityId: "duplicate-expectation"
        })
      ])
    );
    expect(result?.graph?.expectations.map((expectation) => expectation.localId)).toEqual([
      "kept-expectation"
    ]);
    expect(result?.graph?.evidence.map((evidence) => evidence.localId)).toEqual(["kept-evidence"]);
  });

  it("omits duplicate child entities before they can collide in the graph", () => {
    const result = parseQualityMaps([fixtureQualityMapSource("invalid/duplicate-child-ids.yaml")])
      .results[0];

    expect(result?.status).toBe("partial");
    expect(result?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "DUPLICATE_ENTITY_ID",
          affectedEntityId: "shared-task"
        }),
        expect.objectContaining({
          severity: "error",
          code: "DUPLICATE_ENTITY_ID",
          affectedEntityId: "shared-evidence"
        })
      ])
    );
    expect(result?.graph?.tasks.map((task) => task.localId)).toEqual(["unique-task"]);
    expect(result?.graph?.evidence.map((evidence) => evidence.localId)).toEqual(["unique-evidence"]);
  });

  it("preserves stable identity and source attribution instead of display-name identity", () => {
    const result = parseQualityMaps([fixtureQualityMapSource("identity/non-numbered-quality-map.yaml")])
      .results[0];
    const graph = result?.graph;

    expect(graph?.target.localId).toBe("freeform-target");
    expect(graph?.target.normalizedId).toBe(
      "identity/non-numbered-quality-map.yaml#target:freeform-target"
    );
    expect(graph?.expectations.map((expectation) => expectation.normalizedId)).toEqual([
      "identity/non-numbered-quality-map.yaml#expectation:same-title-a",
      "identity/non-numbered-quality-map.yaml#expectation:same-title-b"
    ]);
    expect(graph?.expectations.every((expectation) => expectation.title === "Duplicate Display Name")).toBe(
      true
    );
    expect(graph?.expectations.every((expectation) => expectation.sourceAttribution.mapPath === "identity/non-numbered-quality-map.yaml")).toBe(
      true
    );
    expect(graph?.expectations.every((expectation) => expectation.sourceAttribution.yamlPath.startsWith("$.expectations"))).toBe(
      true
    );
    expect(graph?.expectations.every((expectation) => expectation.sourceAttribution.sourceClassification === "structured_quality_map")).toBe(
      true
    );
    expect(graph?.expectations.map((expectation) => expectation.sourceAttribution.snippet)).toEqual([
      '- id: "same-title-a"',
      '- id: "same-title-b"'
    ]);
  });

  it("attributes repeated nested records to the matching YAML list item", () => {
    const result = parseQualityMaps([fixtureQualityMapSource("complete/quality-map.yaml")])
      .results[0];
    const graph = result?.graph;

    expect(graph?.tasks.map((task) => task.sourceAttribution.snippet)).toEqual([
      '- id: "T010"',
      '- id: "T011"'
    ]);
    expect(graph?.evidence.map((evidence) => evidence.sourceAttribution.snippet)).toEqual([
      '- id: "contract-checkout"',
      '- id: "integration-payment-recovery"'
    ]);
  });

  it("exposes deterministic parse, validate, and normalize steps", () => {
    const parsed = parseQualityMap(fixtureQualityMapSource("complete/quality-map.yaml"));
    const validated = validateQualityMap(parsed);
    const normalized = normalizeQualityMap(validated);
    const repeated = normalizeQualityMap(validateQualityMap(parsed));

    expect(parsed.status).toBe("parsed");
    expect(validated.status).toBe("valid");
    expect(normalized.status).toBe("valid");
    expect(repeated).toEqual(normalized);
  });

  it("does not upload source data or read linked artifacts while parsing", () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("External fetch is not allowed.");
    }) as typeof fetch;

    try {
      const result = parseQualityMaps([fixtureQualityMapSource("complete/quality-map.yaml")])
        .results[0];
      expect(result?.graph?.evidence.map((evidence) => evidence.path)).toContain(
        "tests/contract/checkout.contract.test.ts"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(called).toBe(false);
  });

  it("does not mutate source quality-map files while parsing", async () => {
    const source = fixtureQualityMapSource("complete/quality-map.yaml");
    const before = await stat(source.resolvedLocalPath);

    parseQualityMaps([source]);

    const after = await stat(source.resolvedLocalPath);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});
