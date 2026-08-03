import { describe, expect, it } from "vitest";
import { buildOwnerView } from "@shiplightai/quality-core";
import { ownerStructuredResult } from "../fixtures/owner-view/build-fixtures";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";
import { snapshotProjectFiles } from "../fixtures/quality-projects/file-snapshot";

describe("owner view integration", () => {
  it("surfaces release risk without a computed quality score", () => {
    const view = buildOwnerView({
      result: ownerStructuredResult(),
      targetId: "owner/quality-map.yaml#target:owner-target",
      highPriorityOnly: true
    });

    expect(view.expectations).toHaveLength(2);
    expect(view.riskSummary.badgeCounts).toMatchObject({ Covered: 1, Gap: 1 });
    expect(JSON.stringify(view)).not.toContain("quality score");
  });

  it("keeps next proof and deferred follow-up context on partial expectations", () => {
    const view = buildOwnerView({
      result: ownerStructuredResult(),
      targetId: "owner/quality-map.yaml#target:owner-target"
    });

    const expectation = view.expectations.find((item) => item.title === "P1 risk is visible");

    expect(expectation).toMatchObject({
      status: "PARTIAL",
      nextBestProof: "Run release review.",
      deferredFollowUps: []
    });
  });

  it("updates when the selected target changes or disappears", () => {
    const ready = buildOwnerView({
      result: ownerStructuredResult(),
      targetId: "owner/quality-map.yaml#target:owner-target"
    });
    const missing = buildOwnerView({ result: ownerStructuredResult(), targetId: "removed" });

    expect(ready.state).toBe("ready");
    expect(missing.state).toBe("missingTarget");
  });

  it("does not mutate scanned files or upload while building owner content", async () => {
    const fixture = await createFixtureProject("owner-read-only", [
      {
        relativePath: "specs/project/test-spec.md",
        contents: "# Test Spec: Owner\n\n## Testing What\n\nOwner content.\n"
      }
    ]);
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("External fetch is not allowed.");
    }) as typeof fetch;

    try {
      const before = await snapshotProjectFiles(fixture.root);
      buildOwnerView({ result: ownerStructuredResult(), targetId: "owner/quality-map.yaml#target:owner-target" });
      const after = await snapshotProjectFiles(fixture.root);
      expect(after).toEqual(before);
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.cleanup();
    }
  });
});
