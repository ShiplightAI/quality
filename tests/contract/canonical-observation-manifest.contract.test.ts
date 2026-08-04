import { describe, expect, it } from "vitest";
import {
  buildQualityObservationManifestJsonSchema,
  ingestObservationManifest,
  parseQualityObservationManifest
} from "@shiplightai/quality-core";

function canonicalManifest(
  observations: readonly Record<string, unknown>[] = [
    {
      path: "tests/login.spec.ts",
      test_case: "user can sign in",
      status: "pass"
    }
  ]
): string {
  return JSON.stringify({
    schema_version: 1,
    revision: {
      commit: "abc123",
      branch: "main"
    },
    run: {
      id: "run-123",
      url: "https://example.test/runs/123"
    },
    observed_at: "2026-07-26T18:00:00Z",
    observations
  });
}

describe("canonical quality-observations manifest", () => {
  it("accepts the single versioned workflow output format", () => {
    const result = ingestObservationManifest({
      report_json: canonicalManifest(),
      source: {
        id: "release-workflow",
        kind: "github-actions",
        label: "Release workflow"
      },
      artifact: {
        kind: "github-actions-artifact",
        path: "quality-observations/quality-observations.json"
      }
    });

    expect(result.status).toBe("valid");
    expect(result.diagnostics).toEqual([]);
    expect(result.observations).toEqual([
      expect.objectContaining({
        testFile: "tests/login.spec.ts",
        testCase: "user can sign in",
        status: "pass",
        observedAt: "2026-07-26T18:00:00.000Z",
        revision: {
          commit: "abc123",
          branch: "main",
          dirty: false
        },
        source: expect.objectContaining({
          id: "release-workflow",
          kind: "github-actions",
          runId: "run-123",
          runUrl: "https://example.test/runs/123"
        })
      })
    ]);
  });

  it("rejects legacy arrays and test_file aliases", () => {
    const legacyArray = ingestObservationManifest({
      report_json: JSON.stringify([
        {
          test_file: "tests/login.spec.ts",
          status: "passed",
          observed_at: "2026-07-26T18:00:00Z"
        }
      ])
    });
    const legacyField = ingestObservationManifest({
      report_json: canonicalManifest([
        {
          test_file: "tests/login.spec.ts",
          status: "pass"
        }
      ])
    });

    expect(legacyArray.status).toBe("invalid");
    expect(legacyArray.diagnostics[0]?.message).toContain("schema_version");
    expect(legacyField.status).toBe("invalid");
    expect(
      legacyField.diagnostics.some(
        (entry) => entry.message.includes("unknown fields") && entry.message.includes("test_file")
      )
    ).toBe(true);
  });

  it("warns and skips invalid entries without discarding usable observations", () => {
    const report = canonicalManifest([
      {
        path: "tests/login.spec.ts",
        test_case: "User can sign in",
        status: "pass"
      },
      {
        path: "tests/unknown-field.spec.ts",
        status: "pass",
        unexpected: true
      },
      {
        path: "tests/bad-status.spec.ts",
        status: "passed"
      },
      {
        path: "tests/bad-time.spec.ts",
        status: "pass",
        observed_at: "not-a-time"
      },
      {
        path: "tests\\login.spec.ts",
        test_case: " User can sign in ",
        status: "fail"
      }
    ]);

    const result = ingestObservationManifest({ report_json: report });

    expect(result.status).toBe("partial");
    // Path separators and surrounding whitespace are normalized, so this is one
    // identity recorded twice. Tolerant ingestion keeps a single record and
    // takes the worst status: a duplicate must never report pass over a fail.
    expect(result.observations).toEqual([
      expect.objectContaining({
        testFile: "tests/login.spec.ts",
        testCase: "User can sign in",
        status: "fail"
      })
    ]);
    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics.every((entry) => entry.severity === "warning")).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "DUPLICATE_OBSERVATION_KEY"
      })
    );

    const strict = parseQualityObservationManifest(report);
    expect(strict.status).toBe("invalid");
    expect(strict.document).toBeUndefined();
  });

  it("treats test names that differ only in case as separate identities", () => {
    // Observation identity is exact: two tests whose names differ only in case
    // are two tests. Folding them would discard a record — here the failing one
    // — and reject the whole artifact under strict validation. The case-
    // insensitive join in resolve.ts still maps both onto the same evidence.
    const report = canonicalManifest([
      {
        path: "src/parser.test.ts",
        test_case: "Returns null when the header is absent",
        status: "pass"
      },
      {
        path: "src/parser.test.ts",
        test_case: "returns null when the header is absent",
        status: "fail"
      }
    ]);

    const result = ingestObservationManifest({ report_json: report });

    expect(result.status).toBe("valid");
    expect(result.diagnostics).toEqual([]);
    expect(result.observations.map((entry) => [entry.testCase, entry.status])).toEqual([
      ["Returns null when the header is absent", "pass"],
      ["returns null when the header is absent", "fail"]
    ]);

    const strict = parseQualityObservationManifest(report);
    expect(strict.status).toBe("valid");
    expect(strict.document?.observations).toHaveLength(2);
  });

  it("requires revision and observation time at the manifest boundary", () => {
    const result = ingestObservationManifest({
      report_json: JSON.stringify({
        schema_version: 1,
        observations: [
          {
            path: "tests/login.spec.ts",
            status: "pass"
          }
        ]
      })
    });

    expect(result.status).toBe("invalid");
    expect(result.diagnostics[0]?.message).toContain("revision");
    expect(result.diagnostics[0]?.message).toContain("observed_at");
  });

  it("rejects an empty manifest with an explicit no-usable-records diagnostic", () => {
    const result = ingestObservationManifest({
      report_json: canonicalManifest([])
    });

    expect(result.status).toBe("invalid");
    expect(result.observations).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INVALID_OBSERVATION_ARTIFACT",
        message: expect.stringContaining("did not contain any usable records")
      })
    );
  });

  it("publishes the non-empty composite observation identity constraint", () => {
    const schema = buildQualityObservationManifestJsonSchema() as {
      readonly properties: {
        readonly observations: {
          readonly minItems?: number;
          readonly uniqueItems?: boolean;
          readonly "x-unique-by"?: readonly string[];
        };
      };
    };

    expect(schema.properties.observations.minItems).toBe(1);
    expect(schema.properties.observations.uniqueItems).toBe(true);
    expect(schema.properties.observations["x-unique-by"]).toEqual(["path", "test_case"]);
  });
});
