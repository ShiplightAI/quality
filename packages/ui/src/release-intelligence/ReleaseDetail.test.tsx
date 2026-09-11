// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReleaseDetailView } from "@shiplightai/quality-core/release-intelligence";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ReleaseDetail } from "./ReleaseDetail";
import { ReleaseUiHostProvider } from "./host";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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

const detail: ReleaseDetailView = {
  repository: "ShiplightAI/store",
  release: {
    id: "release-1",
    commitSha: "a".repeat(40),
    workflowName: "Production release",
    workflowUrl: "https://github.com/ShiplightAI/store/actions/runs/42",
    workflowRunId: "42",
    environment: "production",
    components: ["web"],
    publishStatus: "unknown",
  },
  features: [
    {
      id: "feature-1",
      featureKey: "checkout",
      name: "Checkout",
      description: "Customer checkout",
      priority: "P0",
      status: "confirmed",
      sourceRefs: [],
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
      kind: "insufficient_proof",
      severity: "critical",
      title: "Checkout is unverified",
      reason: "No admissible evidence.",
      recommendedAction: "Add exact-run evidence.",
      blocksWithoutException: true,
    },
  ],
  assessmentEvidence: [],
  evidence: [],
  systemFacts: [],
  rules: [
    {
      id: "rule-1",
      ruleKey: "block-unverified-p0",
      status: "fail",
      inputs: { assessmentIds: ["assessment-1"] },
      effect: "block",
      reason: "A P0 behavior lacks proof.",
    },
  ],
  exceptions: [],
  attempts: [
    {
      id: "attempt-1",
      attemptNumber: 1,
      triggerType: "workflow_gate",
      status: "block",
      analyzerVersion: "release-intelligence/0.1.0",
      factSetHash: null,
      decision: "BLOCK",
      summary: { featureCount: 1, behaviorCount: 1, verifiedCount: 0, issueCount: 1 },
      diagnostics: [],
      startedAt: "2026-09-10T00:00:00.000Z",
      completedAt: "2026-09-10T00:00:01.000Z",
      createdAt: "2026-09-10T00:00:00.000Z",
    },
  ],
};

describe("ReleaseDetail", () => {
  it("renders the complete shared detail workspace", () => {
    render(
      <MantineProvider>
        <ReleaseUiHostProvider
          host={{ routeBase: "/release-intelligence", apiBase: "/api/release-intelligence" }}
        >
          <ReleaseDetail detail={detail} />
        </ReleaseUiHostProvider>
      </MantineProvider>,
    );

    expect(screen.getByText("Production release")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Features" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Runs & Artifacts" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Release Rules" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Analysis History" })).toBeInTheDocument();
    expect(screen.getByText("Prioritized issues")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Release Rules" }));
    expect(screen.getByText("Deterministic decision boundary")).toBeInTheDocument();
    expect(screen.getByText("Owner approval required")).toBeInTheDocument();
  });
});
