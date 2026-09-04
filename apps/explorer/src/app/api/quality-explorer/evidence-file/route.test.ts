import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The evidence-file route serves run-evidence out of the opened project. Its
// whole job is deciding what NOT to serve, so the cases below are mostly about
// refusal: a path that escapes the project, a type that is not display
// evidence, and names that percent-decoding can quietly turn into other files.

let root: string;

function projectFile(relative: string, contents: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents, "utf8");
}

async function get(...segments: readonly string[]): Promise<Response> {
  const { GET } = await import("./[...ref]/route");
  return GET(new Request("http://127.0.0.1/evidence"), {
    params: Promise.resolve({ ref: segments }),
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "qc-evidence-route-"));
  process.env.QUALITY_PROJECT_ROOT = root;
  // project-root caches its resolution per module instance.
  vi.resetModules();
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
  delete process.env.QUALITY_PROJECT_ROOT;
});

describe("evidence-file route", () => {
  it("serves a report with its content type and a document CSP", async () => {
    projectFile("playwright-report/index.html", "<h1>report</h1>");

    const response = await get("playwright-report", "index.html");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // Served HTML comes from a scanned repo, which is not a trusted author.
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(await response.text()).toBe("<h1>report</h1>");
  });

  it("does not send a document CSP on a non-scriptable asset", async () => {
    projectFile("playwright-report/data/video.webm", "binary");

    const response = await get("playwright-report", "data", "video.webm");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/webm");
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  it("uses path segments as given rather than decoding them a second time", async () => {
    // Next has already percent-decoded each segment. Decoding again is not a
    // no-op on a name that legitimately contains `%`: this file would resolve
    // to `a b.txt` instead, and a name like `100% progress` would throw.
    projectFile("probe/a%20b.txt", "literal-percent-name");
    projectFile("probe/a b.txt", "space-name");

    expect(await (await get("probe", "a%20b.txt")).text()).toBe("literal-percent-name");
    expect(await (await get("probe", "a b.txt")).text()).toBe("space-name");
  });

  it("serves a name containing a percent sign rather than failing to decode it", async () => {
    // Playwright names artifact folders after the test title, so `%` in a title
    // reaches the filesystem.
    projectFile("probe/100% progress.txt", "percent-in-name");

    const response = await get("probe", "100% progress.txt");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("percent-in-name");
  });

  it("refuses a path that escapes the project root", async () => {
    // Pointed at a file that really exists outside the root, so the refusal is
    // the containment check rather than the target simply being absent.
    const outside = mkdtempSync(path.join(tmpdir(), "qc-evidence-outside-"));
    writeFileSync(path.join(outside, "secret.txt"), "secret", "utf8");

    try {
      const response = await get("..", path.basename(outside), "secret.txt");
      expect(response.status).toBe(403);
    } finally {
      rmSync(outside, { force: true, recursive: true });
    }
  });

  it("reports an escape to a path that does not exist as not found", async () => {
    expect((await get("..", "..", "nope", "absent.txt")).status).toBe(404);
  });

  it("refuses a symlink that resolves outside the project root", async () => {
    // Lexical containment cannot see this: `path.resolve` never follows links,
    // so the check has to compare real paths.
    const outside = mkdtempSync(path.join(tmpdir(), "qc-evidence-outside-"));
    writeFileSync(path.join(outside, "secret.txt"), "secret", "utf8");
    symlinkSync(outside, path.join(root, "escape"));

    try {
      expect((await get("escape", "secret.txt")).status).toBe(403);
    } finally {
      rmSync(outside, { force: true, recursive: true });
    }
  });

  it("refuses a file type that is not display evidence", async () => {
    // An allowlist, so a checked-in `.command` or `.sh` in a scanned repo is
    // never handed to a browser.
    projectFile("scripts/run.sh", "#!/bin/sh\necho hi");

    expect((await get("scripts", "run.sh")).status).toBe(415);
  });

  it("reports a missing file as not found", async () => {
    expect((await get("playwright-report", "absent.html")).status).toBe(404);
  });

  it("refuses a directory", async () => {
    mkdirSync(path.join(root, "playwright-report"), { recursive: true });

    expect((await get("playwright-report")).status).toBe(415);
  });
});
