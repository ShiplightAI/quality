// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ObservationSourcesView, type ObservationSourceRow } from "./ObservationSourcesView";

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

afterEach(() => cleanup());

const source: ObservationSourceRow = {
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
};

function renderView(installedRepos: readonly string[] = ["ShiplightAI/monots"]): void {
  render(
    <MantineProvider>
      <ObservationSourcesView profiles={[source]} installedRepos={installedRepos} />
    </MantineProvider>
  );
}

describe("ObservationSourcesView (read-only, copy-to-agent)", () => {
  it("renders sources read-only with copy-to-agent controls, no live editors", () => {
    renderView();
    expect(screen.getByText("CLI publish")).toBeInTheDocument();
    expect(screen.getByText("cli-publish")).toBeInTheDocument();
    // Remove is copy-to-agent; adding points to the `/quality improve` skill (a description, not a
    // copy button or form). No live Save/Publish and no source form fields.
    expect(screen.getByRole("button", { name: /copy: remove source/i })).toBeInTheDocument();
    expect(screen.getByText(/\/quality improve/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy: add source/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^save/i })).toBeNull();
    expect(screen.queryByLabelText(/^repository$/i)).toBeNull();
    expect(screen.queryByLabelText(/^workflow$/i)).toBeNull();
  });

  it("flags a source whose repo is not in the GitHub App installation", () => {
    renderView([]); // no connected repos
    expect(screen.getByText(/repo not in installation/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no sources", () => {
    render(
      <MantineProvider>
        <ObservationSourcesView profiles={[]} installedRepos={[]} />
      </MantineProvider>
    );
    expect(screen.getByText(/no observation sources yet/i)).toBeInTheDocument();
    // Adding is a description pointing to `/quality improve`, not a copy button (the empty-state line
    // and the add-source description both name it).
    expect(screen.getAllByText(/\/quality improve/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /copy: add source/i })).toBeNull();
  });
});
