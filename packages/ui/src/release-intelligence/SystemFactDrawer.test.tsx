// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReleaseIssueEvidenceView } from "@shiplightai/quality-core/release-intelligence";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SystemFactDrawer } from "./SystemFactDrawer";

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

const commitSha = "d".repeat(40);
const base: Omit<ReleaseIssueEvidenceView, "systemFacts" | "issues" | "rules"> = {
  repository: "ShiplightAI/store",
  release: { commitSha },
  features: [],
  behaviors: [],
  assessments: [],
  evidence: [],
  assessmentEvidence: [],
};

describe("SystemFactDrawer", () => {
  it("renders an actionable, immutable source location for a failed system fact", () => {
    const detail: ReleaseIssueEvidenceView = {
      ...base,
      systemFacts: [
        {
          id: "fact-1",
          factKey: "repository-facts-complete",
          status: "failed",
          severity: "critical",
          summary: "Repository facts are incomplete.",
          exceptionEligible: false,
          findings: [
            {
              code: "INVALID_YAML",
              message: "Could not parse quality-map.yaml.",
              remediation: "Fix YAML.",
              declarationPath: ".quality/evidence/api/quality-map.yaml",
              yamlPath: "$.expectations[0].risk",
              line: 32,
              column: 5,
              snippet: "risk:",
            },
          ],
        },
      ],
      issues: [
        {
          id: "issue-1",
          assessmentId: null,
          systemFactId: "fact-1",
          kind: "analysis_error",
          severity: "critical",
          title: "Repository facts are incomplete",
          reason: "The quality map is invalid.",
          recommendedAction: "Fix YAML.",
          blocksWithoutException: true,
        },
      ],
      rules: [],
    };

    render(
      <MantineProvider>
        <SystemFactDrawer detail={detail} issueId="issue-1" onClose={vi.fn()} />
      </MantineProvider>,
    );

    expect(screen.getByText("Analysis-integrity problems cannot be waived.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: ".quality/evidence/api/quality-map.yaml:32:5 ↗",
      }),
    ).toHaveAttribute(
      "href",
      `https://github.com/ShiplightAI/store/blob/${commitSha}/.quality/evidence/api/quality-map.yaml#L32`,
    );
  });

  it("opens a healthy system fact without inventing a release problem", () => {
    const detail: ReleaseIssueEvidenceView = {
      ...base,
      systemFacts: [
        {
          id: "fact-passed",
          factKey: "workflow-evidence-complete",
          status: "passed",
          severity: "critical",
          summary: "Workflow evidence collection stayed within the supported bounds.",
          findings: [],
          exceptionEligible: false,
        },
      ],
      issues: [],
      rules: [],
    };

    render(
      <MantineProvider>
        <SystemFactDrawer detail={detail} systemFactId="fact-passed" onClose={vi.fn()} />
      </MantineProvider>,
    );

    expect(screen.getByText("Workflow evidence collection is healthy")).toBeInTheDocument();
    expect(screen.getByText("This check does not affect the release decision.")).toBeInTheDocument();
  });
});
