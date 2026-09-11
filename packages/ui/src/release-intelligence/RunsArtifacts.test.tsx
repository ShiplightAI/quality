// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReleaseEvidenceInputsView } from "@shiplightai/quality-core/release-intelligence";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RunsArtifacts } from "./RunsArtifacts";

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

const commitSha = "a".repeat(40);
const detail: ReleaseEvidenceInputsView = {
  repository: "ShiplightAI/store",
  release: { commitSha },
  systemFacts: [],
  evidence: [
    {
      id: "evidence-file",
      evidenceKey: "contract",
      kind: "contract",
      sourceName: "Checkout contract",
      runtimeStatus: "passed",
      identityStatus: "matched",
      collectionStatus: "available",
      fileRef: { path: "reports/contract.json", startLine: 4 },
      providerRef: null,
      archiveRef: null,
      contentHash: null,
      details: {},
    },
    {
      id: "evidence-opaque",
      evidenceKey: "artifact",
      kind: "artifact",
      sourceName: "Stored artifact metadata",
      runtimeStatus: "unknown",
      identityStatus: "unverifiable",
      collectionStatus: "available",
      fileRef: null,
      providerRef: "artifact:42",
      archiveRef: null,
      contentHash: null,
      details: {},
    },
  ],
};

describe("RunsArtifacts", () => {
  it("links repository files at the immutable analyzed commit", () => {
    render(
      <MantineProvider>
        <RunsArtifacts detail={detail} onViewSystemFact={vi.fn()} />
      </MantineProvider>,
    );

    expect(screen.getByRole("link", { name: "Checkout contract" })).toHaveAttribute(
      "href",
      `https://github.com/ShiplightAI/store/blob/${commitSha}/reports/contract.json#L4`,
    );
    expect(screen.queryByRole("link", { name: "Stored artifact metadata" })).toBeNull();
  });
});
