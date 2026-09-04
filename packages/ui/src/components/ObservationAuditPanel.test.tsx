// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ObservationResolutionAuditRow } from "@shiplightai/quality-core";
import { QcUiHostProvider, type QcUiHost } from "../host";
import { ObservationAuditPanel } from "./ObservationAuditPanel";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
});

afterEach(() => cleanup());

function auditRow(overrides: Partial<ObservationResolutionAuditRow> = {}): ObservationResolutionAuditRow {
  return {
    observationId: "obs-1",
    matchStatus: "matched",
    testFile: "tests/checkout.yaml",
    testCase: "guest can pay",
    context: "runtime-review",
    status: "pass",
    observedAt: "2026-08-27T10:00:00.000Z",
    evidenceRefs: [],
    ...overrides
  };
}

function hostWith(servesEvidenceFiles: boolean): QcUiHost {
  return {
    routeBase: "/quality-explorer",
    apiBase: "/api/quality-explorer",
    setProject: async () => ({ ok: true }),
    servesEvidenceFiles
  };
}

function renderPanel(
  rows: readonly ObservationResolutionAuditRow[],
  servesEvidenceFiles = true
): void {
  render(
    <MantineProvider>
      <QcUiHostProvider host={hostWith(servesEvidenceFiles)}>
        <ObservationAuditPanel rows={rows} onClose={() => {}} />
      </QcUiHostProvider>
    </MantineProvider>
  );
}

describe("ObservationAuditPanel run evidence", () => {
  it("links an http ref and shows the host it points at", () => {
    // Refs are written by evidence producers, so the viewer is told where the
    // link goes before clicking rather than trusting a producer-chosen label.
    renderPanel([
      auditRow({
        evidenceRefs: [
          { ref: "https://app.shiplight.ai/runs/8412?test=99231", label: "Shiplight run 8412" }
        ]
      })
    ]);

    const link = screen.getByRole("link", { name: /Shiplight run 8412/ });
    expect(link).toHaveAttribute("href", "https://app.shiplight.ai/runs/8412?test=99231");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("app.shiplight.ai")).toBeInTheDocument();
  });

  it("falls back to a generic label when the producer supplied none", () => {
    renderPanel([auditRow({ evidenceRefs: [{ ref: "https://app.shiplight.ai/runs/8412" }] })]);

    expect(screen.getByRole("link", { name: /Run evidence/ })).toBeInTheDocument();
  });

  it("serves a project-relative ref through the host, as path segments", () => {
    // Path segments, not a query parameter: the reports these refs point at
    // fetch their own video and trace with relative urls, which only resolve if
    // the served page sits at the same shape of address as its folder.
    renderPanel([
      auditRow({ evidenceRefs: [{ ref: "playwright-report/index.html", label: "Test report" }] })
    ]);

    const link = screen.getByRole("link", { name: /Test report/ });
    expect(link).toHaveAttribute(
      "href",
      "/api/quality-explorer/evidence-file/playwright-report/index.html"
    );
    expect(screen.getByText("playwright-report/index.html")).toBeInTheDocument();
  });

  it("encodes each path segment without collapsing the path", () => {
    renderPanel([auditRow({ evidenceRefs: [{ ref: "reports/my run/index.html" }] })]);

    expect(screen.getByRole("link", { name: /Run evidence/ })).toHaveAttribute(
      "href",
      "/api/quality-explorer/evidence-file/reports/my%20run/index.html"
    );
  });

  it("shows a project-relative ref as text when the host cannot serve files", () => {
    // A hosted reader with no local checkout has nothing to serve. Linking
    // anyway would render a link that 404s on click.
    renderPanel(
      [auditRow({ evidenceRefs: [{ ref: "playwright-report/index.html", label: "Test report" }] })],
      false
    );

    expect(screen.queryByRole("link", { name: /Test report/ })).not.toBeInTheDocument();
    expect(screen.getByText(/playwright-report\/index\.html/)).toBeInTheDocument();
  });

  it("renders no run evidence section when the observation carried no refs", () => {
    renderPanel([auditRow()]);

    expect(screen.queryByLabelText("Run evidence")).not.toBeInTheDocument();
  });

  it("keeps run evidence separate from the workflow run link", () => {
    renderPanel([
      auditRow({
        runUrl: "https://github.com/ShiplightAI/shipyard/actions/runs/42",
        evidenceRefs: [{ ref: "https://app.shiplight.ai/runs/8412", label: "Shiplight run 8412" }]
      })
    ]);

    expect(screen.getByRole("link", { name: /Open workflow result/ })).toHaveAttribute(
      "href",
      "https://github.com/ShiplightAI/shipyard/actions/runs/42"
    );
    expect(screen.getByRole("link", { name: /Shiplight run 8412/ })).toHaveAttribute(
      "href",
      "https://app.shiplight.ai/runs/8412"
    );
  });
});
