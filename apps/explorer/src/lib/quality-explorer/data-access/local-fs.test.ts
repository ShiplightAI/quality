import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { scanOp } = vi.hoisted(() => ({
  scanOp: vi.fn(async () => ({ result: {}, observationSourceEnv: [] })),
}));

vi.mock("@shiplightai/quality-core/operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shiplightai/quality-core/operations")>()),
  scanOp,
}));

describe("local filesystem data access", () => {
  beforeEach(() => {
    scanOp.mockClear();
    process.env.QUALITY_PROJECT_ROOT = "./selected-project";
  });

  it("ignores a client-supplied path and scans only the startup-selected root", async () => {
    const { localFsDataAccess } = await import("./local-fs");

    await localFsDataAccess.scan({ projectPath: "/tmp/untrusted", mode: "scan" });

    expect(scanOp).toHaveBeenCalledWith({
      projectPath: path.resolve("./selected-project"),
      mode: "scan",
    });
  });

  it("rejects repository writes", async () => {
    const { localFsDataAccess } = await import("./local-fs");

    expect(() => localFsDataAccess.saveFeatures({ projectPath: "/tmp/untrusted", edits: [] })).toThrowError(
      expect.objectContaining({ status: 405, code: "qc-read-only" }),
    );
  });
});
