"use client";

import { Button } from "@mantine/core";
import { Check, Copy, X } from "lucide-react";
import { useState } from "react";

export function CopyFixPromptButton({ prompt }: { readonly prompt: string }): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Button
      type="button"
      variant="light"
      color={status === "copied" ? "green" : status === "error" ? "red" : "gray"}
      size="xs"
      leftSection={
        status === "copied" ? (
          <Check size={14} />
        ) : status === "error" ? (
          <X size={14} />
        ) : (
          <Copy size={14} />
        )
      }
      onClick={(event) => {
        event.stopPropagation();
        void copyPrompt();
      }}
      aria-live="polite"
    >
      {status === "copied" ? "Copied" : status === "error" ? "Copy failed" : "Copy fix prompt"}
    </Button>
  );
}
