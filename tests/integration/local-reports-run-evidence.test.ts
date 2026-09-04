import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLocalReportsTransport,
  executeObservationSourceProfile,
  LOCAL_REPORTS_PROVIDER,
  parseObservationSourceProfiles,
  resolveObservations,
  scanProject,
  type ObservationSourceProfile
} from "@shiplightai/quality-core";
import { createFixtureProject } from "../fixtures/quality-projects/build-fixtures";

// End-to-end validation of the host transport seam using the bundled
// local-reports provider: a real Playwright report on disk, read through a
// registered host transport, resolved against a quality map, arriving as run
// evidence on the matched check. Nothing here is platform-specific — this is
// the whole run-evidence path working with no service involved.
//
// The evidence is the report a reviewer opens, not a catalogue of the videos
// and screenshots inside it. Quality indexes checks to evidence; the runner's
// report is already the viewer.

const hostTransports = { [LOCAL_REPORTS_PROVIDER]: createLocalReportsTransport() };

const QUALITY_MAP = `target:
  id: "checkout"
  name: "Checkout"
  scope: "feature"
expectations:
  - id: "guest-checkout"
    title: "A guest can complete a purchase"
    source_type: "SOURCE"
    category: "functional"
    priority: "P0"
    evidence:
      - id: "guest-pays"
        type: "e2e"
        path: "tests/checkout.spec.ts"
        test_case: "guest can pay"
        command: "npx playwright test"
        contexts:
          - "ci"
`;

const OBSERVATION_SOURCES = `profiles:
  - id: "local-playwright"
    name: "Local Playwright run"
    transport: "host"
    host:
      provider: "local-reports"
      options:
        path: "playwright-report/report.json"
        report: "playwright-report/index.html"
`;

function playwrightReport(): string {
  return JSON.stringify({
    config: { version: "1.60.0" },
    suites: [
      {
        title: "checkout.spec.ts",
        file: "tests/checkout.spec.ts",
        specs: [
          {
            title: "guest can pay",
            file: "tests/checkout.spec.ts",
            tests: [
              {
                projectName: "chromium",
                results: [
                  {
                    status: "passed",
                    duration: 4200,
                    startTime: "2026-08-27T10:00:00.000Z"
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    stats: { startTime: "2026-08-27T10:00:00.000Z", duration: 4200 }
  });
}

async function fixture(reportJson: string | undefined) {
  return createFixtureProject("local-reports-run-evidence", [
    { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
    { relativePath: ".quality/config/observation-sources.yaml", contents: OBSERVATION_SOURCES },
    ...(reportJson === undefined
      ? []
      : [{ relativePath: "playwright-report/report.json", contents: reportJson }])
  ]);
}

function profileFrom(root: string): ObservationSourceProfile {
  const batch = parseObservationSourceProfiles([
    {
      projectRelativePath: ".quality/config/observation-sources.yaml",
      resolvedLocalPath: path.join(root, ".quality/config/observation-sources.yaml"),
      sourcePattern: ".quality/config/observation-sources.yaml"
    }
  ]);
  const profile = batch.primary?.document?.profiles[0];
  if (profile === undefined) {
    throw new Error(`fixture profile did not parse: ${JSON.stringify(batch.primary?.diagnostics)}`);
  }
  return profile;
}

describe("local-reports host transport", () => {
  it("turns a Playwright report on disk into run evidence on the matched check", async () => {
    const project = await fixture(playwrightReport());

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations).toHaveLength(1);
      expect(execution.observations[0]?.status).toBe("pass");
      expect(execution.observations[0]?.evidenceRefs).toEqual([
        { ref: "playwright-report/index.html", label: "Test report" }
      ]);

      const scan = await scanProject({ projectPath: project.root, mode: "scan" });
      const resolution = resolveObservations(scan, execution);
      const matched = resolution.auditRows.filter((row) => row.matchStatus === "matched");

      expect(matched).toHaveLength(1);
      expect(matched[0]?.evidenceLocalId).toBe("guest-pays");
      expect(matched[0]?.evidenceRefs.map((entry) => entry.ref)).toEqual([
        "playwright-report/index.html"
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("produces observations with no refs when no report is configured", async () => {
    // The results still count. Only the link to look at them is missing.
    const project = await createFixtureProject("local-reports-no-report", [
      { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-playwright"
    name: "Local Playwright run"
    transport: "host"
    host:
      provider: "local-reports"
      options:
        path: "playwright-report/report.json"
`
      },
      { relativePath: "playwright-report/report.json", contents: playwrightReport() }
    ]);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations).toHaveLength(1);
      expect(execution.observations[0]?.status).toBe("pass");
      expect(execution.observations[0]?.evidenceRefs).toEqual([]);
    } finally {
      await project.cleanup();
    }
  });

  it("records an absolute report URL as given", async () => {
    const project = await createFixtureProject("local-reports-url", [
      { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-playwright"
    name: "Local Playwright run"
    transport: "host"
    host:
      provider: "local-reports"
      options:
        path: "playwright-report/report.json"
        report: "https://ci.example.test/runs/42/index.html"
`
      },
      { relativePath: "playwright-report/report.json", contents: playwrightReport() }
    ]);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations[0]?.evidenceRefs).toEqual([
        { ref: "https://ci.example.test/runs/42/index.html", label: "Test report" }
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a report pointer that escapes the project root", async () => {
    const project = await createFixtureProject("local-reports-report-escape", [
      { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-playwright"
    name: "Local Playwright run"
    transport: "host"
    host:
      provider: "local-reports"
      options:
        path: "playwright-report/report.json"
        report: "../../etc/passwd"
`
      },
      { relativePath: "playwright-report/report.json", contents: playwrightReport() }
    ]);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations[0]?.evidenceRefs).toEqual([]);
      expect(
        execution.diagnostics.some(
          (entry) => entry.severity === "error" && entry.message.includes("outside the project root")
        )
      ).toBe(true);
    } finally {
      await project.cleanup();
    }
  });

  it("says the report records no commit rather than stamping one onto it", async () => {
    // Stamping the working tree's HEAD onto a report that may predate it would
    // invent provenance the producer never claimed.
    const project = await fixture(playwrightReport());

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations[0]?.revision.commit).toBeUndefined();
      const unpinned = execution.diagnostics.find((entry) => entry.message.includes("records no commit"));
      expect(unpinned?.severity).toBe("info");
    } finally {
      await project.cleanup();
    }
  });

  it("pins the commit when config supplies one", async () => {
    const project = await createFixtureProject("local-reports-pinned", [
      { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `${OBSERVATION_SOURCES}        commit: "abc123"\n`
      },
      { relativePath: "playwright-report/report.json", contents: playwrightReport() }
    ]);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations[0]?.revision.commit).toBe("abc123");
      expect(execution.diagnostics).toEqual([]);
    } finally {
      await project.cleanup();
    }
  });

  it("warns rather than errors when the suite has not been run yet", async () => {
    // No report on disk is an ordinary state locally. Every check it would have
    // proven already reads unobserved; a red error adds nothing.
    const project = await fixture(undefined);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations).toEqual([]);
      expect(execution.diagnostics[0]?.severity).toBe("warning");
      expect(execution.diagnostics[0]?.code).toBe("MISSING_OBSERVATION_ARTIFACT_MATCH");
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a report path that escapes the project root", async () => {
    const project = await createFixtureProject("local-reports-escape", [
      { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-playwright"
    name: "Local Playwright run"
    transport: "host"
    host:
      provider: "local-reports"
      options:
        path: "../../etc/passwd"
`
      }
    ]);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations).toEqual([]);
      expect(execution.diagnostics[0]?.severity).toBe("error");
      expect(execution.diagnostics[0]?.message).toContain("outside the project root");
    } finally {
      await project.cleanup();
    }
  });

  it("refuses an absolute report path outside the project root", async () => {
    // Containment has to cover the absolute form too. Letting `/etc/hosts`
    // through while refusing `../../etc/hosts` would enforce nothing: a profile
    // is repo config, and a PR can write either spelling.
    const project = await createFixtureProject("local-reports-absolute-escape", [
      { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-playwright"
    name: "Local Playwright run"
    transport: "host"
    host:
      provider: "local-reports"
      options:
        path: "/etc/hosts"
`
      }
    ]);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations).toEqual([]);
      expect(execution.diagnostics[0]?.severity).toBe("error");
      expect(execution.diagnostics[0]?.message).toContain("outside the project root");
    } finally {
      await project.cleanup();
    }
  });

  it("refuses an absolute report pointer outside the project root", async () => {
    const project = await createFixtureProject("local-reports-absolute-report", [
      { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-playwright"
    name: "Local Playwright run"
    transport: "host"
    host:
      provider: "local-reports"
      options:
        path: "playwright-report/report.json"
        report: "/etc/hosts"
`
      },
      { relativePath: "playwright-report/report.json", contents: playwrightReport() }
    ]);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.observations[0]?.evidenceRefs).toEqual([]);
      expect(
        execution.diagnostics.some(
          (entry) => entry.severity === "error" && entry.message.includes("outside the project root")
        )
      ).toBe(true);
    } finally {
      await project.cleanup();
    }
  });

  it("rejects an unsupported report format by name", async () => {
    const project = await createFixtureProject("local-reports-format", [
      { relativePath: ".quality/evidence/checkout/quality-map.yaml", contents: QUALITY_MAP },
      {
        relativePath: ".quality/config/observation-sources.yaml",
        contents: `profiles:
  - id: "local-playwright"
    name: "Local Playwright run"
    transport: "host"
    host:
      provider: "local-reports"
      options:
        path: "reports/junit.xml"
        format: "junit-xml"
`
      }
    ]);

    try {
      const execution = await executeObservationSourceProfile({
        profile: profileFrom(project.root),
        projectRoot: project.root,
        hostTransports
      });

      expect(execution.diagnostics[0]?.message).toContain("junit-xml");
      expect(execution.diagnostics[0]?.message).toContain("playwright-json");
    } finally {
      await project.cleanup();
    }
  });
});
