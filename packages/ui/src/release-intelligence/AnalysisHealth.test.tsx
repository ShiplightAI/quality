// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReleaseAnalysisHealthView } from "@shiplightai/quality-core/release-intelligence";
import { AnalysisHealth, AnalysisHealthSummary } from "./AnalysisHealth";

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
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => cleanup());

const detail: ReleaseAnalysisHealthView = {
  systemFacts: [
    {
      id: "fact-1",
      factKey: "repository-facts-complete",
      status: "failed",
      severity: "critical",
      summary: "1 repository fact problem prevented a complete scan.",
      exceptionEligible: false,
      findings: [
        {
          code: "MISSING_EVIDENCE_FILE",
          message: "The configured evidence path does not exist.",
          remediation: "Restore, replace, or remove the stale evidence declaration.",
          declarationPath: ".quality/evidence/cli/quality-map.yaml",
          affectedPath: "apps/cli/test.ts",
        },
      ],
    },
  ],
};

describe("AnalysisHealth", () => {
  it("summarizes the concrete problem and opens analysis health", () => {
    const onViewDetails = vi.fn();
    render(
      <MantineProvider>
        <AnalysisHealthSummary detail={detail} onViewDetails={onViewDetails} />
      </MantineProvider>,
    );

    expect(screen.getByText("Analysis inputs incomplete: 1 problem")).toBeInTheDocument();
    expect(screen.getByText("Configured evidence file is missing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View problem details" }));
    expect(onViewDetails).toHaveBeenCalledOnce();
  });

  it("shows a compact system fact row that opens its drawer", () => {
    const onViewDetails = vi.fn();
    render(
      <MantineProvider>
        <AnalysisHealth detail={detail} onViewDetails={onViewDetails} />
      </MantineProvider>,
    );

    expect(screen.getByText("1 problem found · View details ›")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Repository configuration details" }));
    expect(onViewDetails).toHaveBeenCalledWith("fact-1");
  });
});
