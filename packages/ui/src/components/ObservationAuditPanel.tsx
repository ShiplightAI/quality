"use client";

import { ExternalLink, X } from "lucide-react";
import { ActionIcon, Anchor, Badge, Code, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import { useQcApi, useQcHost } from "../host";
import type { NormalizedEvidenceRef, ObservationResolutionAuditRow } from "@shiplightai/quality-core";

type MatchFilter = "all" | ObservationResolutionAuditRow["matchStatus"];

interface ObservationAuditPanelProps {
  readonly rows: readonly ObservationResolutionAuditRow[];
  onClose(): void;
}

function isAbsoluteUrl(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

// The single place the UI looks at a ref at all, and it looks only at whether
// the producer already gave us something a browser can open, or whether the
// host can turn a project path into something it can.
//
// A path is passed through as PATH SEGMENTS rather than a query parameter. The
// reports these refs point at fetch their own assets with relative urls, so the
// served page has to sit at the same shape of address as the folder it came
// from or its video and trace links resolve to nothing.
//
// Anything else stays text: resolving it needs a host that can, and guessing a
// URL for it would invent a destination.
function evidenceHref(
  ref: string,
  qcApi: (path: string) => string,
  servesEvidenceFiles: boolean
): string | undefined {
  if (isAbsoluteUrl(ref)) {
    return ref;
  }

  if (!servesEvidenceFiles) {
    return undefined;
  }

  const segments = ref
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));
  return segments.length === 0 ? undefined : qcApi(`/evidence-file/${segments.join("/")}`);
}

// Refs are written by evidence producers, so the destination is shown rather
// than hidden behind a label the producer also chose. A project-relative ref
// shows its path instead: the host it would resolve to is this application,
// which tells the reader nothing.
function evidenceDestination(ref: string): string {
  if (!isAbsoluteUrl(ref)) {
    return ref;
  }

  try {
    return new URL(ref).host;
  } catch {
    return ref;
  }
}

function evidenceLabel(entry: NormalizedEvidenceRef): string {
  return entry.label ?? "Run evidence";
}

function sourceLabel(row: ObservationResolutionAuditRow): string {
  return row.testFile ?? row.testClass ?? row.observationId;
}

function shortLabel(value: string): string {
  const segments = value.split("/");
  return segments[segments.length - 1] ?? value;
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function filterLabel(filter: MatchFilter): string {
  switch (filter) {
    case "matched":
      return "Matched";
    case "ambiguous":
      return "Ambiguous";
    case "unmatched":
      return "Unmatched";
    default:
      return "All";
  }
}

function countFor(rows: readonly ObservationResolutionAuditRow[], filter: MatchFilter): number {
  if (filter === "all") {
    return rows.length;
  }

  return rows.filter((row) => row.matchStatus === filter).length;
}

export function ObservationAuditPanel({
  rows,
  onClose
}: ObservationAuditPanelProps): React.ReactElement {
  const qcApi = useQcApi();
  const { servesEvidenceFiles = false } = useQcHost();
  const [filter, setFilter] = useState<MatchFilter>("all");
  const filteredRows = useMemo(
    () => rows.filter((row) => filter === "all" || row.matchStatus === filter),
    [filter, rows]
  );

  return (
    <aside className="workspace-detail-panel" aria-label="Proof-source join audit panel">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text size="xs" c="dimmed" tt="uppercase">Runtime audit</Text>
          <Title order={2}>Proof-source join audit</Title>
          <Text size="sm" c="dimmed">Each runtime observation is joined onto structured evidence by canonical repo-relative test file path.</Text>
        </Stack>
        <ActionIcon aria-label="Close audit panel" variant="subtle" color="gray" onClick={onClose}>
          <X aria-hidden size={18} />
        </ActionIcon>
      </Group>

      <Group gap="sm" mt="sm">
        <Text size="sm">{rows.length} audit row{rows.length === 1 ? "" : "s"}</Text>
        <Code>runtime-proof-join</Code>
      </Group>

      <div className="audit-filter-row" aria-label="Join audit filters">
        {(["all", "matched", "ambiguous", "unmatched"] as const).map((option) => (
          <button
            className={filter === option ? "audit-filter-button audit-filter-button-active" : "audit-filter-button"}
            key={option}
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
            type="button"
          >
            <span>{filterLabel(option)}</span>
            <strong>{countFor(rows, option)}</strong>
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <Text c="dimmed" mt="md">No audit rows match the current filter.</Text>
      ) : (
        <Stack gap="sm" mt="md" aria-label="Join audit rows">
          {filteredRows.map((row) => (
            <Paper
              p="md"
              key={`${row.observationId}:${row.evidenceId ?? row.matchStatus}:${row.targetId ?? "none"}`}
            >
              <Group justify="space-between">
                <Text fw={600}>{shortLabel(sourceLabel(row))}</Text>
                <Badge color={row.matchStatus === "matched" ? "green" : row.matchStatus === "ambiguous" ? "yellow" : row.matchStatus === "unmatched" ? "red" : "gray"}>
                  {filterLabel(row.matchStatus)}
                </Badge>
              </Group>
              {row.testCase !== undefined ? <Text size="sm" mt={4}>{row.testCase}</Text> : null}

              <Stack gap={2} mt="xs">
                <Text size="sm"><strong>Proof source</strong> {sourceLabel(row)}</Text>
                <Text size="sm"><strong>Observation</strong> {titleCase(row.status)}</Text>
                {row.targetLocalId !== undefined && row.evidenceLocalId !== undefined ? (
                  <Text size="sm"><strong>Matched evidence</strong> {row.targetLocalId} / {row.evidenceLocalId}</Text>
                ) : null}
                {row.evidencePath !== undefined ? (
                  <Text size="sm"><strong>Evidence path</strong> {row.evidencePath}</Text>
                ) : null}
                {row.runId !== undefined ? (
                  <Text size="sm"><strong>Run id</strong> {row.runId}</Text>
                ) : null}
              </Stack>

              {row.runUrl !== undefined ? (
                <Anchor href={row.runUrl} target="_blank" rel="noopener noreferrer" mt="xs">
                  Open workflow result <ExternalLink aria-hidden size={14} />
                </Anchor>
              ) : null}

              {row.evidenceRefs.length > 0 ? (
                <Stack gap={2} mt="xs" aria-label="Run evidence">
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed">Run evidence</Text>
                  {row.evidenceRefs.map((entry) => {
                    const href = evidenceHref(entry.ref, qcApi, servesEvidenceFiles);
                    const destination = evidenceDestination(entry.ref);
                    return href === undefined ? (
                      <Text
                        key={entry.ref}
                        size="xs"
                        c="dimmed"
                        style={{ fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" }}
                      >
                        {evidenceLabel(entry)}: {entry.ref}
                      </Text>
                    ) : (
                      <Group key={entry.ref} gap={6} wrap="nowrap">
                        <Anchor href={href} target="_blank" rel="noopener noreferrer" size="sm">
                          {evidenceLabel(entry)} <ExternalLink aria-hidden size={14} />
                        </Anchor>
                        <Text size="xs" c="dimmed" style={{ wordBreak: "break-all" }}>
                          {destination}
                        </Text>
                      </Group>
                    );
                  })}
                </Stack>
              ) : null}
            </Paper>
          ))}
        </Stack>
      )}
    </aside>
  );
}
