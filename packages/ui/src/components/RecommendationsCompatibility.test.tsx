// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "../testing";
import type { GenerateRecommendationsResponse } from "../lib/ranked-recommendations";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { TopLeverageRecommendations } from "./TopLeverageRecommendations";

const legacyStaticPayload = {
  path: "/repo/.quality/generated/recommendations/static--whole-project.json",
  file: {
    schema_version: "6",
    generated_at: "2026-08-07T00:00:00.000Z",
    project_path: ".",
    project_root: "/repo",
    scope: { kind: "whole-project", id: "whole-project", name: "Whole project" },
    recommendations: []
  }
} as unknown as GenerateRecommendationsResponse;

beforeAll(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })));
});

afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe("recommendations compatibility", () => {
  it("renders the panel without crashing when an older payload lacks score availability", () => {
    render(
      <MantineProvider>
        <RecommendationsPanel payload={legacyStaticPayload} onClose={() => undefined} />
      </MantineProvider>
    );

    expect(screen.getByText("Quality score unavailable")).toBeInTheDocument();
  });

  it("renders the overview without crashing when an older payload lacks score availability", () => {
    render(
      <MantineProvider>
        <TopLeverageRecommendations
          generatedRecommendations={legacyStaticPayload}
          isPanelOpen={false}
          onOpenPanel={() => undefined}
        />
      </MantineProvider>
    );

    expect(screen.getByText("Quality score unavailable")).toBeInTheDocument();
  });
});
