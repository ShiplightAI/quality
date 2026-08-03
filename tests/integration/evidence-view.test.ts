import { stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildEvidenceDrawer,
  buildEvidenceView
} from "@shiplightai/quality-core";
import {
  evidenceQualityMapSource,
  evidenceStructuredResult
} from "../fixtures/evidence-view/build-fixtures";

const targetId = "complete/quality-map.yaml#target:evidence-target";

describe("evidence view integration", () => {
  it("keeps artifact handling read-only and local", async () => {
    const source = evidenceQualityMapSource();
    const before = await stat(source.resolvedLocalPath);
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      throw new Error("External upload is not allowed.");
    }) as typeof fetch;

    try {
      const view = buildEvidenceView({
        result: evidenceStructuredResult(),
        targetId
      });
      const localDrawer = buildEvidenceDrawer({
        view,
        evidenceId: "complete/quality-map.yaml#evidence:contract-proof",
        expectationId: "complete/quality-map.yaml#expectation:checkout"
      });
      const remoteDrawer = buildEvidenceDrawer({
        view,
        evidenceId: "complete/quality-map.yaml#evidence:e2e-proof",
        expectationId: "complete/quality-map.yaml#expectation:owner-drilldown"
      });

      expect(localDrawer?.artifacts.map((artifact) => artifact.kind)).toEqual(["local_path"]);
      expect(localDrawer?.artifacts[0]?.href).toBe("file://reports/evidence contract.html");
      expect(remoteDrawer?.artifacts.map((artifact) => artifact.kind)).toEqual(["external_url"]);
      expect(remoteDrawer?.artifacts[0]?.href).toBe("https://quality.example.test/evidence");
    } finally {
      globalThis.fetch = originalFetch;
    }

    const after = await stat(source.resolvedLocalPath);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(fetchCalled).toBe(false);
  });

  it("preserves duplicate file or command references as distinct evidence relationships", () => {
    const view = buildEvidenceView({
      result: evidenceStructuredResult(),
      targetId
    });
    const paths = view.expectationGroups.flatMap((group) =>
      group.rows.map((row) => row.artifacts[0]?.pathOrUrl ?? row.evidenceLabel)
    );

    expect(paths).toContain("reports/evidence contract.html");
    expect(view.canonicalEvidence.map((evidence) => evidence.evidenceId)).toEqual(
      expect.arrayContaining([
        "complete/quality-map.yaml#evidence:contract-proof",
        "complete/quality-map.yaml#evidence:state-disagreement"
      ])
    );
  });

  it("keeps valid graph records visible alongside diagnostics", () => {
    const view = buildEvidenceView({
      result: evidenceStructuredResult(),
      targetId
    });

    expect(view.canonicalEvidence).toHaveLength(3);
    expect(view.diagnostics).toEqual([]);
  });
});
