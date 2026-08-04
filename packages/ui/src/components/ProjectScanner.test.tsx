// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render, testHost } from "../testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectScanner } from "./ProjectScanner";

// Hoisted mocks so the vi.mock factories can reference them.
const { refreshMock, setProjectMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  setProjectMock: vi.fn(async (): Promise<{ ok: true } | { error: string }> => ({ ok: true })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/quality-explorer",
  useSearchParams: () => new URLSearchParams(),
}));


beforeAll(() => {
  // Mantine's Select/Popover use ResizeObserver, which jsdom doesn't provide. Use defineProperty
  // (not vi.stubGlobal) so afterEach's unstubAllGlobals doesn't strip it between tests.
  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  });
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

// The project-persistence action reaches the component through the host seam, so the mock is
// injected there rather than by mocking a module the package no longer imports.
const renderWithHost = (ui: React.ReactElement): ReturnType<typeof render> =>
  render(ui, { host: { ...testHost, setProject: setProjectMock } });

beforeEach(() => {
  refreshMock.mockClear();
  setProjectMock.mockClear();
  // A scan that never resolves — the component stays in its initial state (no result).
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const hostedProject = { kind: "hosted", projectKey: "hosted:abc" } as const;

describe("ProjectScanner — local path input in a local deployment", () => {
  it("shows the Project path input for a hosted project when local projects are allowed (dev)", () => {
    renderWithHost(
      <MantineProvider>
        <ProjectScanner view="dashboard" project={hostedProject} localAllowed />
      </MantineProvider>
    );
    // Even though a HOSTED project is selected, a local deployment can still switch to a local path.
    expect(screen.getByLabelText("Project path")).toBeInTheDocument();
  });

  it("hides the Project path input in a hosted deployment (localAllowed=false) — security boundary", () => {
    renderWithHost(
      <MantineProvider>
        <ProjectScanner view="dashboard" project={hostedProject} localAllowed={false} />
      </MantineProvider>
    );
    // A hosted/staging deployment must never expose host-path scanning to untrusted org users.
    expect(screen.queryByLabelText("Project path")).toBeNull();
  });

  it("submitting a path persists it as the local project and re-resolves (switch back from hosted)", async () => {
    renderWithHost(
      <MantineProvider>
        <ProjectScanner view="dashboard" project={hostedProject} localAllowed />
      </MantineProvider>
    );
    const input = await screen.findByLabelText("Project path");
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "/workspace/project" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() =>
      expect(setProjectMock).toHaveBeenCalledWith({ kind: "local", path: "/workspace/project" })
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("does NOT re-resolve when the persist fails (setQcProjectAction returns an error)", async () => {
    setProjectMock.mockResolvedValueOnce({ error: "Sign in first." });
    renderWithHost(
      <MantineProvider>
        <ProjectScanner view="dashboard" project={hostedProject} localAllowed />
      </MantineProvider>
    );
    const input = await screen.findByLabelText("Project path");
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "/some/path" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(setProjectMock).toHaveBeenCalledWith({ kind: "local", path: "/some/path" }));
    // The switch failed → no router.refresh (would otherwise re-resolve to the unchanged cookie).
    await Promise.resolve();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("does NOT persist on an empty-path submit (falls through to a plain re-scan)", async () => {
    renderWithHost(
      <MantineProvider>
        <ProjectScanner view="dashboard" project={hostedProject} localAllowed />
      </MantineProvider>
    );
    const input = await screen.findByLabelText("Project path");
    await waitFor(() => expect(input).not.toBeDisabled());
    // Submit with the input left blank — must not write a `local:` cookie.
    fireEvent.submit(input.closest("form")!);
    await Promise.resolve();
    expect(setProjectMock).not.toHaveBeenCalled();
  });

  it("does NOT re-persist when re-scanning the already-selected local path", async () => {
    const localProject = { kind: "local", path: "/repo/x", projectKey: "local:/repo/x" } as const;
    renderWithHost(
      <MantineProvider>
        <ProjectScanner view="dashboard" project={localProject} localAllowed />
      </MantineProvider>
    );
    const input = await screen.findByLabelText("Project path");
    await waitFor(() => expect(input).not.toBeDisabled());
    // The input is seeded with the current local path; submitting it unchanged is a no-op re-scan.
    fireEvent.submit(input.closest("form")!);
    await Promise.resolve();
    expect(setProjectMock).not.toHaveBeenCalled();
  });
});
