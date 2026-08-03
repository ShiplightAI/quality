"use client";

import Link from "next/link";
import { Anchor } from "@mantine/core";
import { ArrowRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

// A highlighted navigation link for human-gating CTAs (review/ratify/manage), so
// they read as a recognizable class distinct from plain text links and solid
// action buttons. Styled in globals.css (.gate-link).
export function GateLink({
  href,
  children
}: {
  readonly href: ComponentProps<typeof Link>["href"];
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <Anchor component={Link} href={href} className="gate-link" underline="never">
      <span>{children}</span>
      <ArrowRight aria-hidden size={14} />
    </Anchor>
  );
}
