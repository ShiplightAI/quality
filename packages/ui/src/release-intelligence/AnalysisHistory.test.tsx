// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReleaseAnalysisHistoryView } from "@shiplightai/quality-core/release-intelligence";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AnalysisHistory } from "./AnalysisHistory";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

const detail: ReleaseAnalysisHistoryView = {
  attempts: [
    {
      id: "attempt-2",
      attemptNumber: 2,
      triggerType: "manual_reanalysis",
      status: "allow",
      analyzerVersion: "0.3.1",
      factSetHash: "abcdef1234567890",
      decision: "ALLOW",
      summary: null,
      diagnostics: [],
      startedAt: "2026-09-09T00:00:00.000Z",
      completedAt: "2026-09-09T00:01:00.000Z",
      createdAt: "2026-09-09T00:00:00.000Z",
    },
    {
      id: "attempt-1",
      attemptNumber: 1,
      triggerType: "workflow_gate",
      status: "collecting",
      analyzerVersion: "0.3.0",
      factSetHash: null,
      decision: null,
      summary: null,
      diagnostics: [],
      startedAt: null,
      completedAt: null,
      createdAt: "2026-09-08T00:00:00.000Z",
    },
  ],
};

describe("AnalysisHistory", () => {
  it("renders immutable attempts from serialized timestamps", () => {
    render(
      <MantineProvider>
        <AnalysisHistory detail={detail} />
      </MantineProvider>,
    );

    expect(screen.getByText("Attempt 2")).toBeInTheDocument();
    expect(screen.getByText("manual re-analysis")).toBeInTheDocument();
    expect(screen.getByText("facts abcdef123456")).toBeInTheDocument();
    expect(screen.getByText(/Started not yet · completed not yet/)).toBeInTheDocument();
  });
});
