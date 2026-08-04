// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@shiplightai/quality-core";
import { Settings } from "./Settings";

beforeAll(() => {
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
      dispatchEvent: vi.fn()
    }))
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Minimal ScanResult with one observation source + one set referencing it. Cast because Settings only
// reads observationSourceProfiles.primary.document.profiles and observationSets.primary.document.observationSets.
function makeResult(): ScanResult {
  return {
    diagnostics: [],
    observationSourceProfiles: {
      primary: {
        document: {
          profiles: [
            {
              id: "cli-publish",
              name: "CLI publish",
              transport: "github-actions",
              observationPath: "quality-observations.json",
              github: {
                repo: "ShiplightAI/monots",
                workflow: "publish-cli.yml",
                artifactNames: ["junit"],
                branch: "main"
              }
            }
          ]
        }
      }
    },
    observationSets: {
      primary: {
        document: {
          observationSets: [{ id: "set-1", name: "Release gate", profiles: [{ profileId: "cli-publish" }] }]
        }
      }
    }
  } as unknown as ScanResult;
}

function stubScan(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ result: makeResult() }) }))
  );
}

describe("Settings — observation sources & sets (read-only, copy-to-agent)", () => {
  it("renders sources and sets read-only with copy-to-agent controls, no Save/Publish", async () => {
    stubScan();
    render(
      <MantineProvider>
        <Settings projectPath="/repo" projectKey="local:/repo" installedRepos={["ShiplightAI/monots"]} />
      </MantineProvider>
    );

    // Source + set render read-only. "CLI publish" appears twice: the source card and the set's
    // membership badge (proving the set resolves its source id to the source name).
    expect((await screen.findAllByText("CLI publish")).length).toBe(2);
    expect(screen.getByText("Release gate")).toBeInTheDocument();
    expect(screen.getByText("set-1")).toBeInTheDocument();

    // Remove is copy-to-agent for both source + set; adding each points to `/quality improve`
    // (a description, not a copy button). No live Save draft / Publish.
    expect(screen.getByRole("button", { name: /copy: remove source/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy: remove set/i })).toBeInTheDocument();
    expect(screen.getAllByText(/\/quality improve/i).length).toBe(2); // add-source + add-set descriptions
    expect(screen.queryByRole("button", { name: /copy: add source/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy: add set/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^publish$/i })).toBeNull();
  });

  it("shows the empty-state guard when no project is selected", () => {
    render(
      <MantineProvider>
        <Settings projectPath="" projectKey={null} installedRepos={[]} />
      </MantineProvider>
    );
    expect(screen.getByText(/select a quality explorer source/i)).toBeInTheDocument();
  });
});
