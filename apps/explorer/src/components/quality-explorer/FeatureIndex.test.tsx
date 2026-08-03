// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@shiplightai/quality-core";
import type { TargetSummary } from "@shiplightai/quality-core/workspace";
import { FeatureIndex } from "./FeatureIndex";

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

// Minimal ScanResult: one project-map feature + one derived source. Cast because the full
// ScanResult shape is large and FeatureIndex only reads these paths (features, project.sourceRefs,
// productDocs, sources.primary.document.sources).
function makeResult(): ScanResult {
  return {
    projectMaps: {
      primary: {
        map: {
          features: [
            { id: "001-alpha", name: "Alpha Feature", status: "candidate", priority: "P1", description: "The alpha." }
          ],
          project: { name: "Demo", summary: "A demo project", sourceRefs: [{ path: "specs/alpha/spec.md", label: "Alpha spec" }] },
          productDocs: []
        }
      }
    },
    sources: { primary: { document: { sources: [] } } }
  } as unknown as ScanResult;
}

function makeTarget(): TargetSummary {
  return {
    featureKey: "001-alpha",
    evidenceConfidence: "MEDIUM",
    expectationCount: 3,
    gapCounts: { weak: 1 },
    releaseRiskCounts: { blockers: 0 }
  } as unknown as TargetSummary;
}

function renderIndex(): void {
  render(
    <MantineProvider>
      <FeatureIndex
        result={makeResult()}
        targets={[makeTarget()]}
        projectName="Demo"
        projectSummary="A demo project"
        projectKey="demo"
      />
    </MantineProvider>
  );
}

describe("FeatureIndex (view-only Explorer)", () => {
  it("renders features and sources read-only", () => {
    renderIndex();
    // Feature name is a link to its page; its recorded priority + confidence show as badges.
    const link = screen.getByRole("link", { name: "Alpha Feature" });
    expect(link).toHaveAttribute("href", expect.stringContaining("feature=001-alpha"));
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
    // A candidate feature shows a read-only "candidate" badge (not a Confirm button).
    expect(screen.getByText("candidate")).toBeInTheDocument();
    // The derived source renders with its verdict as a read-only badge.
    expect(screen.getByText("Alpha spec")).toBeInTheDocument();
  });

  it("exposes no write controls (view-only)", () => {
    renderIndex();
    // No save/curation buttons.
    expect(screen.queryByRole("button", { name: /save sources/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save features/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^confirm$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add input/i })).toBeNull();
    // No editable priority/status selects (they were comboboxes with these aria-labels).
    expect(screen.queryByLabelText(/^priority for/i)).toBeNull();
    expect(screen.queryByLabelText(/^status for/i)).toBeNull();
    expect(screen.queryByLabelText(/add external source/i)).toBeNull();
  });

  it("shows the empty-state guard when no project is selected", () => {
    render(
      <MantineProvider>
        <FeatureIndex result={undefined} targets={[]} projectName="Demo" projectKey={null} />
      </MantineProvider>
    );
    expect(screen.getByText(/select a quality explorer project/i)).toBeInTheDocument();
  });
});
