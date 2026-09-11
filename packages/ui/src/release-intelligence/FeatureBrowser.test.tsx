// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReleaseFeatureBrowserView } from "@shiplightai/quality-core/release-intelligence";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FeatureBrowser } from "./FeatureBrowser";

beforeAll(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
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

afterEach(() => cleanup());

const commitSha = "b".repeat(40);
const detail: ReleaseFeatureBrowserView = {
  repository: "ShiplightAI/store",
  release: { commitSha },
  features: [
    {
      id: "feature-1",
      featureKey: "checkout",
      name: "Checkout",
      description: "Customer checkout",
      priority: "P0",
      status: "confirmed",
      sourceRefs: [{ path: "quality/checkout.yaml", startLine: 7 }],
      diagnostics: [],
    },
  ],
  behaviors: [
    {
      featureId: "feature-1",
      behavior: {
        id: "behavior-1",
        behaviorKey: "checkout:succeeds",
        title: "Checkout succeeds",
        description: null,
        priority: "P0",
        origin: "explicit",
        reviewStatus: "confirmed",
        sourceRefs: [],
        requiredProof: ["checkout succeeds"],
        applicable: true,
      },
    },
  ],
  assessments: [
    {
      id: "assessment-1",
      behaviorSnapshotId: "behavior-1",
      status: "insufficient_proof",
      runtimeStatus: "unknown",
      observedProof: [],
      missingProof: ["checkout succeeds"],
      reason: "No admissible evidence.",
    },
  ],
  issues: [
    {
      id: "issue-1",
      assessmentId: "assessment-1",
      systemFactId: null,
      kind: "missing_proof",
      severity: "critical",
      title: "Checkout is unverified",
      reason: "No admissible evidence.",
      recommendedAction: "Add an exact-run observation.",
      blocksWithoutException: true,
    },
  ],
  assessmentEvidence: [],
};

describe("FeatureBrowser", () => {
  it("renders the desktop feature list beside the active feature behaviors", () => {
    const { container } = render(
      <MantineProvider>
        <FeatureBrowser detail={detail} onViewAssessment={vi.fn()} />
      </MantineProvider>,
    );

    const layout = container.querySelector(".ri-feature-layout");
    const featureNavigation = screen.getByRole("navigation", { name: "Features" });

    expect(layout).toBeInTheDocument();
    expect(layout).toContainElement(featureNavigation);
    expect(layout).toContainElement(screen.getByText("Checkout succeeds"));
    expect(featureNavigation).toHaveClass("ri-feature-nav");
  });

  it("uses exact-commit sources and delegates assessment selection", () => {
    const onViewAssessment = vi.fn();
    render(
      <MantineProvider>
        <FeatureBrowser detail={detail} onViewAssessment={onViewAssessment} />
      </MantineProvider>,
    );

    expect(screen.getByRole("link", { name: "Feature source ↗" })).toHaveAttribute(
      "href",
      `https://github.com/ShiplightAI/store/blob/${commitSha}/quality/checkout.yaml#L7`,
    );
    fireEvent.click(screen.getByRole("button", { name: /Checkout succeeds/ }));
    expect(onViewAssessment).toHaveBeenCalledWith("assessment-1");
  });

  it("keeps only unresolved behaviors in the attention filter", () => {
    render(
      <MantineProvider>
        <FeatureBrowser detail={detail} onViewAssessment={vi.fn()} />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Needs attention" }));
    expect(screen.getByText("Checkout succeeds")).toBeInTheDocument();
  });
});
