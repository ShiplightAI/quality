// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@shiplightai/quality-core";
import { ViewsManager } from "./ViewsManager";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Minimal ScanResult with one saved view over one feature. Cast because ViewsManager only reads
// views.primary.document.views, projectMaps.primary.map.features, and diagnostics.
function makeResult(): ScanResult {
  return {
    diagnostics: [],
    projectMaps: { primary: { map: { features: [{ id: "001-alpha", name: "Alpha Feature" }] } } },
    views: {
      primary: {
        document: {
          views: [
            {
              id: "view-1",
              name: "MVP surface",
              description: "The MVP slice.",
              featureIds: ["001-alpha"]
            }
          ]
        }
      }
    }
  } as unknown as ScanResult;
}

function stubScan(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ result: makeResult() }) }))
  );
}

describe("ViewsManager (read-only, copy-to-agent)", () => {
  it("renders saved views read-only with copy-to-agent controls and no Save", async () => {
    stubScan();
    render(
      <MantineProvider>
        <ViewsManager projectPath="/repo" projectKey="local:/repo" />
      </MantineProvider>
    );

    // Loaded view renders read-only (name, id, included feature).
    expect(await screen.findByText("MVP surface")).toBeInTheDocument();
    expect(screen.getByText("view-1")).toBeInTheDocument();
    expect(screen.getByText(/Alpha Feature/)).toBeInTheDocument();

    // Remove is copy-to-agent; adding a view points to the `/quality improve` skill (a description,
    // not a copy button or a name input). No live Save Views / editable id fields.
    expect(screen.getByRole("button", { name: /copy: remove view/i })).toBeInTheDocument();
    expect(screen.getByText(/\/quality improve/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy: add view/i })).toBeNull();
    expect(screen.queryByLabelText(/name a view to add/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /save views/i })).toBeNull();
    expect(screen.queryByLabelText(/^view id$/i)).toBeNull();
  });

  it("shows the empty-state guard when no project is selected", () => {
    render(
      <MantineProvider>
        <ViewsManager projectPath="" projectKey={null} />
      </MantineProvider>
    );
    expect(screen.getByText(/select a quality explorer source/i)).toBeInTheDocument();
  });
});
