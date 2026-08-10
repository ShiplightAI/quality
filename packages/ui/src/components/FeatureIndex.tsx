"use client";

import { useQcRoute } from "../host";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import {
  Anchor,
  Badge,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  UnstyledButton
} from "@mantine/core";
import type { HumanSource, ProjectMapFeature, ScanResult } from "@shiplightai/quality-core";
import type { TargetSummary } from "@shiplightai/quality-core/workspace";

// Explorer (spec 045): a flat, read-only feature index — the project's sources, then a scannable
// feature table carrying at-a-glance quality columns (confidence · checks · gaps). QC is
// view-only: curation (priority, confirm, sources, add-source) is authored in the repo by a coding
// agent via the `quality` skill (PRs), not here. Per-feature depth lives on the feature page.

const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

function normalizedPriority(priority: string | undefined): string {
  return priority !== undefined && PRIORITIES.includes(priority as (typeof PRIORITIES)[number]) ? priority : "P2";
}

function featuresOf(result: ScanResult | undefined): readonly ProjectMapFeature[] {
  return result?.projectMaps.primary?.map?.features ?? [];
}

function derivedSourceKeys(result: ScanResult | undefined): readonly { key: string; label: string }[] {
  const map = result?.projectMaps.primary?.map;
  if (map === undefined) {
    return [];
  }
  const refs = [...map.project.sourceRefs, ...map.productDocs];
  return refs.flatMap((ref) => {
    const key = ref.path ?? ref.url;
    return key === undefined ? [] : [{ key, label: ref.label ?? key }];
  });
}

/** Merge agent-discovered sources with the human-sources layer by key (read-only display). */
function mergeSources(result: ScanResult | undefined): readonly HumanSource[] {
  const human = result?.sources.primary?.document?.sources ?? [];
  const humanByKey = new Map(human.map((source) => [source.key, source]));
  const merged: HumanSource[] = [];
  const seen = new Set<string>();

  for (const derived of derivedSourceKeys(result)) {
    if (seen.has(derived.key)) {
      continue; // the same path can appear in both sourceRefs and productDocs
    }
    seen.add(derived.key);
    const override = humanByKey.get(derived.key);
    merged.push(
      override ?? { key: derived.key, kind: "doc", origin: "agent", status: "current", label: derived.label }
    );
  }
  for (const source of human) {
    if (!seen.has(source.key)) {
      merged.push(source);
    }
  }
  return merged;
}

function sumGaps(gapCounts: TargetSummary["gapCounts"]): number {
  return Object.values(gapCounts).reduce<number>((total, count) => total + (count ?? 0), 0);
}

// Map the confidence label (HIGH/MEDIUM/LOW, or "No canonical evidence") to a Mantine color.
function confidenceColor(label: string): string {
  const value = label.toLowerCase();
  if (value.startsWith("high")) return "teal";
  if (value.startsWith("medium")) return "yellow";
  if (value.startsWith("low")) return "orange";
  return "gray";
}

// Map a source verdict to a Mantine color for its read-only badge.
function sourceStatusColor(status: string): string {
  switch (status) {
    case "current":
      return "green";
    case "stale":
      return "yellow";
    case "superseded":
      return "gray";
    case "rejected":
      return "red";
    default:
      return "gray";
  }
}

// One feature row (read-only): the quality rollup (from its TargetSummary, if any) plus the
// feature's recorded priority and confirmation state. The chevron expands the description in place.
function FeatureRow({
  feature,
  target
}: {
  readonly feature: ProjectMapFeature;
  readonly target: TargetSummary | undefined;
}): React.ReactElement {
  const qcRoute = useQcRoute();
  const [open, setOpen] = useState(false);
  const hasDescription = feature.description !== undefined && feature.description.trim().length > 0;
  const confirmed = feature.status !== "candidate";
  const gaps = target === undefined ? undefined : sumGaps(target.gapCounts);

  return (
    <div className="feature-index-rowwrap">
      <div className="feature-index-row">
        {hasDescription ? (
          <UnstyledButton
            onClick={() => setOpen((current) => !current)}
            aria-label={open ? "Collapse description" : "Expand description"}
            aria-expanded={open}
            style={{ display: "flex" }}
          >
            <ChevronRight
              size={16}
              aria-hidden
              style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}
            />
          </UnstyledButton>
        ) : (
          <span />
        )}

        <Anchor
          component={Link}
          href={{ pathname: qcRoute("/feature"), query: { feature: feature.id } }}
          fw={600}
          truncate
        >
          {feature.name}
        </Anchor>

        <div style={{ textAlign: "right" }}>
          {target === undefined ? (
            <Text size="sm" c="dimmed">—</Text>
          ) : (
            <Badge
              variant="light"
              color={confidenceColor(target.evidenceConfidence)}
              title={`Evidence confidence: ${target.evidenceConfidence}`}
            >
              {target.evidenceConfidence}
            </Badge>
          )}
        </div>

        <div>
          <Badge size="sm" variant="light">{normalizedPriority(feature.priority)}</Badge>
        </div>

        <div style={{ textAlign: "right" }}>
          {confirmed ? (
            <Badge color="green" variant="light" leftSection={<CheckCircle2 aria-hidden size={12} />}>
              confirmed
            </Badge>
          ) : (
            <Badge color="gray" variant="outline">candidate</Badge>
          )}
        </div>

        <Text ta="right" size="sm" c="dimmed">
          {target?.expectationCount ?? "—"}
        </Text>

        <Text ta="right" size="sm" c={gaps !== undefined && gaps > 0 ? "orange" : "dimmed"}>
          {gaps ?? "—"}
        </Text>
      </div>

      {hasDescription ? (
        <Collapse expanded={open}>
          <Text size="sm" c="dimmed" className="feature-index-desc">
            {feature.description}
          </Text>
        </Collapse>
      ) : null}
    </div>
  );
}

export function FeatureIndex({
  result,
  targets,
  projectName,
  projectSummary,
  projectKey
}: {
  readonly result: ScanResult | undefined;
  readonly targets: readonly TargetSummary[];
  readonly projectName: string;
  readonly projectSummary?: string;
  // null = no project selected; hosted projects share an empty projectPath.
  readonly projectKey: string | null;
}): React.ReactElement {
  const features = useMemo(() => featuresOf(result), [result]);
  const sources = useMemo(() => mergeSources(result), [result]);
  // Join key: a TargetSummary's featureKey is set to its project-map feature id (buildProjectIndex),
  // so the lookup below (`.get(feature.id)`) is total for any feature that has a target. A feature
  // with no target yet (e.g. no checks) has no rollup — its quality columns render as "—".
  const targetByFeatureKey = useMemo(() => {
    const map = new Map<string, TargetSummary>();
    for (const target of targets) {
      if (target.featureKey !== undefined) {
        map.set(target.featureKey, target);
      }
    }
    return map;
  }, [targets]);

  if (projectKey === null) {
    return (
      <Text c="dimmed" size="sm">
        Select a Quality Explorer project to see its features.
      </Text>
    );
  }

  return (
    <Stack gap="lg" aria-label="Explorer">
      <Paper withBorder p="md" radius="md">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={2}>{projectName}</Title>
          {projectSummary ? (
            <Text c="dimmed" size="sm">
              {projectSummary}
            </Text>
          ) : null}
        </Stack>
      </Paper>

      <Stack gap="xs">
        <Group justify="space-between" align="baseline">
          <Title order={3}>Sources</Title>
          <Text size="sm" c="dimmed">
            {sources.length} {sources.length === 1 ? "input" : "inputs"}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          The inputs the agent reads to derive features, with each one&apos;s recorded verdict.
        </Text>
        <Paper withBorder radius="md" className="feature-index-table">
          <div className="source-index-row feature-index-head">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Source</Text>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Origin</Text>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Status</Text>
          </div>
          {sources.map((source) => (
            <div key={source.key} className="feature-index-rowwrap">
              <div className="source-index-row">
                <Text truncate style={{ minWidth: 0 }}>{source.label ?? source.key}</Text>
                <Badge variant="light">{source.origin}</Badge>
                <div>
                  <Badge size="sm" variant="light" color={sourceStatusColor(source.status)}>{source.status}</Badge>
                </div>
              </div>
            </div>
          ))}
        </Paper>
      </Stack>

      <Stack gap="xs">
        <Group justify="space-between" align="baseline">
          <Title order={3}>Features</Title>
          <Text size="sm" c="dimmed">
            {features.length} {features.length === 1 ? "feature" : "features"}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          Drafted by the agent from your sources, with each one&apos;s recorded priority and confirmation.
        </Text>
        {features.length === 0 ? (
          <Text c="dimmed" size="sm">
            No features discovered yet.
          </Text>
        ) : (
          <Paper withBorder radius="md" className="feature-index-table">
            <div className="feature-index-row feature-index-head">
              <span />
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">Feature</Text>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" ta="right">Confidence</Text>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">Priority</Text>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" ta="right">Status</Text>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" ta="right">Checks</Text>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" ta="right">Gaps</Text>
            </div>
            {features.map((feature) => (
              <FeatureRow key={feature.id} feature={feature} target={targetByFeatureKey.get(feature.id)} />
            ))}
          </Paper>
        )}
      </Stack>
    </Stack>
  );
}
