// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AnalyzeWorkflowModal } from "./AnalyzeWorkflowModal";
import { ReleaseUiHostProvider } from "./host";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe("AnalyzeWorkflowModal", () => {
  it("uses the host API contract to create an immutable attempt", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ attempt_id: "12345678-1234-1234-1234-123456789abc" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <MantineProvider>
        <ReleaseUiHostProvider
          host={{ routeBase: "/release-intelligence", apiBase: "/api/release-intelligence" }}
        >
          <AnalyzeWorkflowModal
            releaseId="release-1"
            workflowUrl="https://github.com/ShiplightAI/store/actions/runs/42"
            components={["web"]}
          />
        </ReleaseUiHostProvider>
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Analyze workflow again" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start analysis" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/release-intelligence/releases/release-1/attempts",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(await screen.findByText("Attempt 12345678 queued.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
