// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RepositoryFilter } from "./RepositoryFilter";

const replace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/release-checks",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("repo=old&cursor=page-2&environment=prod"),
}));

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

afterEach(() => {
  cleanup();
  replace.mockReset();
});

describe("RepositoryFilter", () => {
  it("replaces the repository and clears the pagination cursor", () => {
    render(
      <MantineProvider>
        <RepositoryFilter
          repos={[
            { id: "old", name: "Old repository" },
            { id: "new", name: "New repository" },
          ]}
          value="old"
        />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Filter releases by repository" }));
    fireEvent.click(screen.getByRole("option", { name: "New repository" }));

    expect(replace).toHaveBeenCalledWith("/release-checks?repo=new&environment=prod");
  });
});
