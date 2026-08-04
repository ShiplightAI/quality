// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FeaturePage } from "./FeaturePage";

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

describe("FeaturePage loading UX", () => {
  it("shows a loading state (not the empty 'no checks' state) while the initial scan is in flight", async () => {
    // A scan that never resolves keeps the component in its loading state (result undefined).
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    render(
      <MantineProvider>
        <FeaturePage projectPath="/repo" projectKey="local:/repo" featureId="001-alpha" />
      </MantineProvider>
    );

    // A loading indicator appears...
    expect(await screen.findByText(/loading feature/i)).toBeInTheDocument();
    // ...and the "no quality checks yet" empty state must NOT show during loading — it's only true
    // once the scan resolves.
    expect(screen.queryByText(/no quality checks yet/i)).toBeNull();
  });

  it("shows the error alert alone (not a loading spinner) when the initial scan fails", async () => {
    // A failed scan leaves result undefined AND error set — the error branch must render the red alert
    // and NOT the "Loading feature…" state (regression guard for the `error === undefined ?` branch).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ detail: "Scan boom" }) }))
    );

    render(
      <MantineProvider>
        <FeaturePage projectPath="/repo" projectKey="local:/repo" featureId="001-alpha" />
      </MantineProvider>
    );

    expect(await screen.findByText("Scan boom")).toBeInTheDocument();
    // Neither the loading state nor the empty state should show alongside a load error.
    expect(screen.queryByText(/loading feature/i)).toBeNull();
    expect(screen.queryByText(/no quality checks yet/i)).toBeNull();
  });

  it("shows the empty-state guard when no project is selected", () => {
    render(
      <MantineProvider>
        <FeaturePage projectPath="" projectKey={null} featureId="001-alpha" />
      </MantineProvider>
    );
    expect(screen.getByText(/open a feature from the project page/i)).toBeInTheDocument();
    expect(screen.queryByText(/no quality checks yet/i)).toBeNull();
  });
});
