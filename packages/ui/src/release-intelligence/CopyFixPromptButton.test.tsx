// @vitest-environment jsdom

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopyFixPromptButton } from "./CopyFixPromptButton";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

describe("CopyFixPromptButton", () => {
  it("copies the full prompt and confirms success", async () => {
    writeText.mockResolvedValue(undefined);
    render(
      <MantineProvider>
        <CopyFixPromptButton prompt="Fix this exact issue" />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy fix prompt" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Fix this exact issue"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("reports clipboard failure without claiming the prompt was copied", async () => {
    writeText.mockRejectedValue(new Error("clipboard denied"));
    render(
      <MantineProvider>
        <CopyFixPromptButton prompt="Fix this exact issue" />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy fix prompt" }));

    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeTruthy();
  });
});
