import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runObservationsCommand } from "./observations";

let fixtureRoot: string;

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "quality-observations-cli-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function output(name: string): string {
  return join(fixtureRoot, name);
}

describe("quality-tools observations", () => {
  it("records one workflow gate in the canonical format", async () => {
    const destination = output("quality-observations.json");

    const result = await runObservationsCommand([
      "record",
      "--path",
      ".github/workflows/publish.yml",
      "--test-case",
      "tarball-size",
      "--status",
      "pass",
      "--commit",
      "abc123",
      "--branch",
      "main",
      "--observed-at",
      "2026-07-26T18:00:00Z",
      "--run-id",
      "123",
      "--run-url",
      "https://example.test/runs/123",
      "--output",
      destination
    ]);

    expect(result).toEqual({ exitCode: 0 });
    expect(JSON.parse(readFileSync(destination, "utf8"))).toEqual({
      schema_version: 1,
      revision: {
        commit: "abc123",
        branch: "main"
      },
      run: {
        id: "123",
        url: "https://example.test/runs/123"
      },
      observed_at: "2026-07-26T18:00:00.000Z",
      observations: [
        {
          path: ".github/workflows/publish.yml",
          test_case: "tarball-size",
          status: "pass"
        }
      ]
    });
  });

  it("converts JUnit at the producer boundary", async () => {
    const source = output("junit.xml");
    const destination = output("quality-observations.json");
    writeFileSync(source, '<testsuite><testcase name="user can sign in" file="tests/login.spec.ts"/></testsuite>');

    const result = await runObservationsCommand([
      "from-junit",
      source,
      "--commit",
      "abc123",
      "--observed-at",
      "2026-07-26T18:00:00Z",
      "--output",
      destination
    ]);

    expect(result).toEqual({ exitCode: 0 });
    expect(JSON.parse(readFileSync(destination, "utf8")).observations).toEqual([
      {
        path: "tests/login.spec.ts",
        test_case: "user can sign in",
        status: "pass"
      }
    ]);
  });

  it("keeps every node:test case when two describe blocks share test names", async () => {
    const source = output("node-test.junit.xml");
    const destination = output("quality-observations.json");
    // node:test writes the describe() title only into <testsuite name>, so
    // without it these four cases collapse into two identities and the whole
    // artifact is rejected.
    writeFileSync(
      source,
      `<testsuites name="node:test">
        <testsuite name="OpenAI">
          <testcase name="throws when neither key is set" file="tests/providerProxy.test.ts"/>
          <testcase name="routes via nova" file="tests/providerProxy.test.ts"/>
        </testsuite>
        <testsuite name="Anthropic">
          <testcase name="throws when neither key is set" file="tests/providerProxy.test.ts"/>
          <testcase name="routes via nova" file="tests/providerProxy.test.ts"/>
        </testsuite>
      </testsuites>`
    );

    const result = await runObservationsCommand([
      "from-junit",
      source,
      "--commit",
      "abc123",
      "--observed-at",
      "2026-07-26T18:00:00Z",
      "--output",
      destination
    ]);

    expect(result).toEqual({ exitCode: 0 });
    expect(JSON.parse(readFileSync(destination, "utf8")).observations).toEqual([
      { path: "tests/providerProxy.test.ts", test_case: "OpenAI › throws when neither key is set", status: "pass" },
      { path: "tests/providerProxy.test.ts", test_case: "OpenAI › routes via nova", status: "pass" },
      { path: "tests/providerProxy.test.ts", test_case: "Anthropic › throws when neither key is set", status: "pass" },
      { path: "tests/providerProxy.test.ts", test_case: "Anthropic › routes via nova", status: "pass" }
    ]);
  });

  it("converts Playwright JSON at the producer boundary", async () => {
    const source = output("playwright.json");
    const destination = output("quality-observations.json");
    writeFileSync(
      source,
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: "user can sign in",
                file: "tests/login.spec.ts",
                tests: [
                  {
                    projectName: "chromium",
                    results: [
                      {
                        status: "passed",
                        startTime: "2026-07-26T18:00:00Z",
                        duration: 100
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      })
    );

    const result = await runObservationsCommand([
      "from-playwright",
      source,
      "--commit",
      "abc123",
      "--observed-at",
      "2026-07-26T18:00:00Z",
      "--output",
      destination
    ]);

    expect(result).toEqual({ exitCode: 0 });
    expect(JSON.parse(readFileSync(destination, "utf8")).observations).toEqual([
      {
        path: "tests/login.spec.ts",
        test_case: "user can sign in",
        status: "pass",
        observed_at: "2026-07-26T18:00:00.100Z"
      }
    ]);
  });

  it("preserves Playwright project identity when one spec runs in several projects", async () => {
    const source = output("playwright-multi-project.json");
    const destination = output("quality-observations.json");
    writeFileSync(
      source,
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: "user can sign in",
                file: "tests/login.spec.ts",
                tests: [
                  {
                    projectName: "chromium",
                    results: [{ status: "passed", startTime: "2026-07-26T18:00:00Z", duration: 100 }]
                  },
                  {
                    projectName: "firefox",
                    results: [{ status: "passed", startTime: "2026-07-26T18:00:00Z", duration: 120 }]
                  }
                ]
              }
            ]
          }
        ]
      })
    );

    const result = await runObservationsCommand([
      "from-playwright",
      source,
      "--commit",
      "abc123",
      "--observed-at",
      "2026-07-26T18:00:00Z",
      "--output",
      destination
    ]);

    expect(result).toEqual({ exitCode: 0 });
    expect(JSON.parse(readFileSync(destination, "utf8")).observations).toEqual([
      expect.objectContaining({
        path: "tests/login.spec.ts",
        test_case: "user can sign in [chromium]",
        status: "pass"
      }),
      expect.objectContaining({
        path: "tests/login.spec.ts",
        test_case: "user can sign in [firefox]",
        status: "pass"
      })
    ]);
  });

  it("merges producer shards from one revision and run", async () => {
    const first = output("first.json");
    const second = output("second.json");
    const destination = output("quality-observations.json");
    const envelope = {
      schema_version: 1,
      revision: { commit: "abc123" },
      run: { id: "run-123" },
      observed_at: "2026-07-26T18:00:00Z"
    };
    writeFileSync(
      first,
      JSON.stringify({
        ...envelope,
        observations: [{ path: "tests/login.spec.ts", status: "pass" }]
      })
    );
    writeFileSync(
      second,
      JSON.stringify({
        ...envelope,
        observations: [{ path: "tests/logout.spec.ts", status: "fail" }]
      })
    );

    expect(await runObservationsCommand(["merge", first, second, "--output", destination])).toEqual({ exitCode: 0 });
    expect(JSON.parse(readFileSync(destination, "utf8")).observations).toEqual([
      { path: "tests/login.spec.ts", status: "pass" },
      { path: "tests/logout.spec.ts", status: "fail" }
    ]);
  });

  it("reports duplicate identities before merging producer shards", async () => {
    const first = output("first.json");
    const second = output("second.json");
    const destination = output("quality-observations.json");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const envelope = {
      schema_version: 1,
      revision: { commit: "abc123" },
      run: { id: "run-123" },
      observed_at: "2026-07-26T18:00:00Z"
    };
    writeFileSync(
      first,
      JSON.stringify({
        ...envelope,
        observations: [{ path: "tests/login.spec.ts", test_case: "user can sign in", status: "pass" }]
      })
    );
    writeFileSync(
      second,
      JSON.stringify({
        ...envelope,
        observations: [{ path: "tests\\login.spec.ts", test_case: " user can sign in ", status: "fail" }]
      })
    );

    expect(await runObservationsCommand(["merge", first, second, "--output", destination])).toEqual({ exitCode: 1 });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Cannot merge duplicate observation identities")
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining("tests/login.spec.ts :: user can sign in"));
  });

  it("uses workflow revision metadata when a converter omits explicit flags", async () => {
    const source = output("junit.xml");
    const destination = output("quality-observations.json");
    const previousCommit = process.env.GITHUB_SHA;
    const previousBranch = process.env.GITHUB_REF_NAME;
    process.env.GITHUB_SHA = "environment-commit";
    process.env.GITHUB_REF_NAME = "feature/environment-revision";
    writeFileSync(source, '<testsuite><testcase name="user can sign in" file="tests/login.spec.ts"/></testsuite>');

    try {
      expect(
        await runObservationsCommand([
          "from-junit",
          source,
          "--observed-at",
          "2026-07-26T18:00:00Z",
          "--output",
          destination
        ])
      ).toEqual({ exitCode: 0 });
      expect(JSON.parse(readFileSync(destination, "utf8")).revision).toEqual({
        commit: "environment-commit",
        branch: "feature/environment-revision"
      });
    } finally {
      if (previousCommit === undefined) {
        delete process.env.GITHUB_SHA;
      } else {
        process.env.GITHUB_SHA = previousCommit;
      }
      if (previousBranch === undefined) {
        delete process.env.GITHUB_REF_NAME;
      } else {
        process.env.GITHUB_REF_NAME = previousBranch;
      }
    }
  });

  it("validates the canonical artifact before a workflow uploads it", async () => {
    const source = output("quality-observations.json");
    writeFileSync(
      source,
      JSON.stringify({
        schema_version: 1,
        revision: { commit: "abc123" },
        observed_at: "2026-07-26T18:00:00Z",
        observations: [{ path: "tests/login.spec.ts", status: "pass" }]
      })
    );

    expect(await runObservationsCommand(["validate", source])).toEqual({ exitCode: 0 });
  });

  it("prints the checked-in canonical schema", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const expected = readFileSync(
      join(process.cwd(), "packages/core/src/observations/quality-observations.schema.json"),
      "utf8"
    );

    expect(await runObservationsCommand(["schema"])).toEqual({ exitCode: 0 });
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual(JSON.parse(expected));
  });

  it("rejects unsupported statuses instead of normalizing synonyms", async () => {
    const destination = output("quality-observations.json");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runObservationsCommand([
      "record",
      "--path",
      "tests/login.spec.ts",
      "--status",
      "passed",
      "--commit",
      "abc123",
      "--output",
      destination
    ]);

    expect(result).toEqual({ exitCode: 1 });
    expect(() => readFileSync(destination, "utf8")).toThrow();
  });
});
