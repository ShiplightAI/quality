"use client";

import { Button, type MantineColor, type MantineSize } from "@mantine/core";
import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Copy-to-agent control (spec 045, read-only QC): copies a plain-language `quality`-skill
// instruction to the clipboard so the viewer can paste it into their coding agent, which
// makes the `.quality/**` edit and opens a PR. The read-only replacement for every former
// edit control. Mirrors CopyFixPromptButton's clipboard guards, but the instruction is a
// static string (no fetch).
export function CopyInstruction({
  instruction,
  label = "Copy instruction",
  color,
  variant = "subtle",
  size = "xs",
}: {
  readonly instruction: string;
  readonly label?: string;
  readonly color?: MantineColor;
  readonly variant?: string; // Mantine Button `variant` is itself string-typed (extensible variants)
  readonly size?: MantineSize;
}): React.ReactElement {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const mounted = useRef(true);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current !== undefined) {
        window.clearTimeout(resetTimer.current); // don't setState on an unmounted button
      }
    };
  }, []);

  function scheduleReset(ms: number): void {
    resetTimer.current = window.setTimeout(() => {
      if (mounted.current) {
        setState("idle");
      }
    }, ms);
  }

  async function copy(): Promise<void> {
    try {
      // navigator.clipboard is undefined in non-secure contexts (plain HTTP, some
      // iframes/test runners); guard rather than let the property access throw.
      if (navigator.clipboard === undefined) {
        setState("error");
        scheduleReset(3000);
        return;
      }
      await navigator.clipboard.writeText(instruction);
      setState("copied");
      scheduleReset(2000);
    } catch (error) {
      console.error(error);
      setState("error");
      scheduleReset(3000);
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      color={color ?? "gray"}
      leftSection={<Copy aria-hidden size={14} />}
      onClick={() => void copy()}
      style={{ alignSelf: "flex-start" }}
      title="Copy an instruction to paste into your coding agent — it makes this change in the repo via a PR."
    >
      {state === "copied" ? "Copied" : state === "error" ? "Clipboard unavailable" : label}
    </Button>
  );
}
