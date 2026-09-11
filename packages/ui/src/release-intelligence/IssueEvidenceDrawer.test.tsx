// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReleaseIssueEvidenceView } from "@shiplightai/quality-core/release-intelligence";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { IssueEvidenceDrawer } from "./IssueEvidenceDrawer";

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

const reason = "Every required proof facet is supported by admissible evidence.";
const detail: ReleaseIssueEvidenceView = {
  repository: "ShiplightAI/store",
  release: { commitSha: "c".repeat(40) },
  features: [
    {
      id: "feature-1",
      featureKey: "checkout",
      name: "Checkout",
      description: "",
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
        description: "Customers can complete checkout.",
        priority: "P0",
        origin: "explicit",
        reviewStatus: "confirmed",
        sourceRefs: [],
        requiredProof: [],
        applicable: true,
      },
    },
  ],
  assessments: [
    {
      id: "assessment-1",
      behaviorSnapshotId: "behavior-1",
      status: "verified",
      runtimeStatus: "passed",
      observedProof: ["Checkout succeeds at runtime"],
      missingProof: [],
      reason,
    },
  ],
  issues: [],
  assessmentEvidence: [
    {
      assessmentId: "assessment-1",
      evidenceRecordId: "evidence-1",
      relationship: "direct",
      reason: "Exact test result match.",
    },
  ],
  evidence: [
    {
      id: "evidence-1",
      evidenceKey: "checkout-test",
      kind: "test",
      sourceName: "checkout test",
      runtimeStatus: "passed",
      identityStatus: "matched",
      collectionStatus: "available",
      providerRef: "/runs/101?test=1001",
      fileRef: null,
      archiveRef: null,
      contentHash: null,
      details: {},
    },
  ],
  systemFacts: [],
  rules: [],
};

describe("IssueEvidenceDrawer", () => {
  it("shows an assessment reason once and preserves navigable provider links", () => {
    render(
      <MantineProvider>
        <IssueEvidenceDrawer detail={detail} assessmentId="assessment-1" onClose={vi.fn()} />
      </MantineProvider>,
    );

    expect(screen.getAllByText(reason)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open run test ↗" })).toHaveAttribute(
      "href",
      "/runs/101?test=1001",
    );
  });
});
