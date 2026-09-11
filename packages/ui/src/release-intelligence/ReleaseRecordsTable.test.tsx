// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReleaseListItemView } from "@shiplightai/quality-core/release-intelligence";
import { ReleaseRecordsTable } from "./ReleaseRecordsTable";
import { ReleaseUiHostProvider } from "./host";

vi.mock("next/navigation", () => ({
  usePathname: () => "/release-checks",
  useSearchParams: () => new URLSearchParams("repository=repo-id"),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
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
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => cleanup());

const record: ReleaseListItemView = {
  id: "release-1",
  repository: "ShiplightAI/store",
  workflowName: "Publish",
  source: "workflow_gate",
  workflowRunId: "42",
  workflowUrl: "https://github.com/ShiplightAI/store/actions/runs/42",
  commitSha: "a".repeat(40),
  environment: "production",
  components: ["web"],
  publishStatus: "published",
  createdAt: "2026-09-09T00:00:00.000Z",
  latestAttempt: { status: "allow", decision: "ALLOW", attemptNumber: 1 },
};

function renderTable(): void {
  render(
    <MantineProvider>
      <ReleaseUiHostProvider
        host={{ routeBase: "/release-checks", apiBase: "/api/release-checks" }}
      >
        <ReleaseRecordsTable records={[record]} nextCursor="next-page" />
      </ReleaseUiHostProvider>
    </MantineProvider>,
  );
}

describe("ReleaseRecordsTable", () => {
  it("fails fast when the host composition root is missing", () => {
    expect(() =>
      render(
        <MantineProvider>
          <ReleaseRecordsTable records={[record]} nextCursor={null} />
        </MantineProvider>,
      ),
    ).toThrow(
      "Release Intelligence components must be rendered inside <ReleaseUiHostProvider>.",
    );
  });

  it("uses the host route and immutable commit URL", () => {
    renderTable();

    expect(screen.getByRole("link", { name: "Publish" })).toHaveAttribute(
      "href",
      "/release-checks/releases/release-1",
    );
    expect(screen.getByRole("link", { name: "aaaaaaaa" })).toHaveAttribute(
      "href",
      `https://github.com/ShiplightAI/store/commit/${"a".repeat(40)}`,
    );
  });

  it("preserves current filters when linking to the next cursor", () => {
    renderTable();

    expect(screen.getByRole("link", { name: /older release checks/i })).toHaveAttribute(
      "href",
      "/release-checks?repository=repo-id&cursor=next-page",
    );
  });
});
