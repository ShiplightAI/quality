import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeQualityMapJsonSchema } from "@shiplightai/quality-map";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runSchemaCommand } from "./schema";
import { runValidateCommand } from "./validate";

const VALID_MAP = [
  'structure_provenance: "agent_generated"',
  "target:",
  '  id: "001-alpha"',
  '  name: "Alpha"',
  '  scope: "feature"',
  "expectations:",
  '  - id: "exp-1"',
  '    title: "A check"',
  '    source_type: "SOURCE"',
  '    category: "auth"',
  '    priority: "P1"',
  "",
].join("\n");

// Missing target.name + expectation source_type/category/priority → error diagnostics.
const INVALID_MAP = ["target:", '  id: "001-alpha"', '  scope: "feature"', "expectations:", '  - id: "exp-1"', '    title: "A check"', ""].join("\n");

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "qt-cli-test-"));
  writeFileSync(join(dir, "valid.yaml"), VALID_MAP);
  writeFileSync(join(dir, "invalid.yaml"), INVALID_MAP);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

describe("quality-tools schema", () => {
  it("writes the canonical schema to stdout and exits 0", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    expect(runSchemaCommand([])).toEqual({ exitCode: 0 });
    expect(write).toHaveBeenCalledWith(serializeQualityMapJsonSchema());
  });

  it("--help exits 0 without printing the schema", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    expect(runSchemaCommand(["--help"])).toEqual({ exitCode: 0 });
    expect(write).not.toHaveBeenCalled();
  });
});

describe("quality-tools validate", () => {
  it("exits 0 on a valid map", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(runValidateCommand([join(dir, "valid.yaml")])).toEqual({ exitCode: 0 });
  });

  it("exits 1 and reports diagnostics on an invalid map", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(runValidateCommand([join(dir, "invalid.yaml")])).toEqual({ exitCode: 1 });
    const output = err.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toMatch(/target\.name is required/);
    expect(output).toMatch(/invalid \(\d+ error/);
  });

  it("exits 1 when no map path is given", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(runValidateCommand([])).toEqual({ exitCode: 1 });
  });

  it("--help exits 0", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(runValidateCommand(["--help"])).toEqual({ exitCode: 0 });
  });
});
