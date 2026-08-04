"use client";

import { useQcRoute } from "../host";

import Link from "next/link";
import { Anchor, Group, Text } from "@mantine/core";
import { ChevronRight } from "lucide-react";

// Top-of-page trail: "Quality Explorer › <current page>". The current source lives in the source
// switcher (persistent header) + a cookie, so the trail needs no `?projectPath=`/`?from=` state —
// the parent always links back to the Quality Explorer overview, and the browser back button returns
// to the exact prior spot.
export function Breadcrumb({ current }: { readonly current: string }): React.ReactElement {
  const qcRoute = useQcRoute();
  return (
    <Group gap={4} component="nav" aria-label="Breadcrumb">
      <Anchor component={Link} href={qcRoute("")} size="sm" c="dimmed">
        Quality Explorer
      </Anchor>
      <ChevronRight aria-hidden size={14} style={{ color: "var(--app-text-tertiary)" }} />
      <Text size="sm" fw={500}>{current}</Text>
    </Group>
  );
}
