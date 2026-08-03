"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Anchor, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { ScanResult } from "@shiplightai/quality-core";

interface GateProgressProps {
  readonly result?: ScanResult;
}

interface GateFeature {
  readonly id: string;
  readonly name: string;
  readonly ratified: boolean;
  readonly hasQualityMap: boolean;
  readonly checkListRatified: boolean;
  readonly attested: boolean;
}

function gateFeatures(result: ScanResult | undefined): readonly GateFeature[] {
  const features = result?.projectMaps.primary?.map?.features ?? [];
  return features.map((feature) => {
    const qualityMapPath = feature.artifacts.qualityMapPath;
    const graph =
      qualityMapPath === undefined
        ? undefined
        : result?.qualityMaps.results.find((candidate) => candidate.source.projectRelativePath === qualityMapPath)?.graph;
    const hasQualityMap = graph !== undefined && graph.expectations.length > 0;
    return {
      id: feature.id,
      name: feature.name,
      ratified: feature.status !== "candidate",
      hasQualityMap,
      checkListRatified: hasQualityMap && graph.checksReviewed,
      attested:
        hasQualityMap && graph.expectations.every((expectation) => expectation.structureProvenance !== "unspecified")
    };
  });
}

export function GateProgress({ result }: GateProgressProps): React.ReactElement | null {
  // Don't render placeholder 0/0 counts while the scan is still loading.
  if (result === undefined) {
    return null;
  }
  const features = gateFeatures(result);
  const ratifiedFeatures = features.filter((feature) => feature.ratified).length;
  const qualityMapFeatures = features.filter((feature) => feature.hasQualityMap);
  const attestedFeatures = qualityMapFeatures.filter((feature) => feature.attested).length;
  const observationSets = result?.observationSets.primary?.document?.observationSets ?? [];
  const profileCount = result?.observationSourceProfiles.primary?.document?.profiles.length ?? 0;

  return (
    <Stack gap="md" aria-label="Review gates">
      {/* Gate 1 — features, sources, priorities */}
      <Paper p="md" component="section" aria-label="Features and priorities">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">Features &amp; priorities</Text>
            <Title order={3}>Confirm which features are real, where they came from, and their priority</Title>
            <Text size="sm" c="dimmed">{ratifiedFeatures}/{features.length} features confirmed</Text>
            {qualityMapFeatures.length > 0 ? (
              <Text size="sm" c="dimmed">{attestedFeatures}/{qualityMapFeatures.length} features have a recorded source</Text>
            ) : null}
          </Stack>
          <Anchor component={Link} href="/quality-explorer/explorer">
            <Group gap={6}><span>Open</span><ArrowRight aria-hidden size={16} /></Group>
          </Anchor>
        </Group>
      </Paper>

      {/* Gate 2 — per-feature checks, drill-in */}
      <Paper p="md" component="section" aria-label="Feature quality checks">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">Feature quality checks</Text>
            <Title order={3}>Review each feature&apos;s quality checks and what counts as proof</Title>
          </Stack>
        </Group>
        {qualityMapFeatures.length > 0 ? (
          <Stack gap="xs" mt="md">
            {qualityMapFeatures.map((feature) => (
              <Group key={feature.id} justify="space-between" wrap="nowrap" align="center">
                <Stack gap={0}>
                  <Text>{feature.name}</Text>
                  <Text size="sm" c={feature.checkListRatified ? "teal" : "dimmed"}>
                    Checklist {feature.checkListRatified ? "approved" : "not reviewed"}
                  </Text>
                </Stack>
                <Anchor component={Link} href={{ pathname: "/quality-explorer/feature", query: { feature: feature.id } }}>
                  <Group gap={6}><span>Open</span><ArrowRight aria-hidden size={16} /></Group>
                </Anchor>
              </Group>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" mt="md">No quality checks yet.</Text>
        )}
      </Paper>

      {/* Observations — gate 6 */}
      <Paper p="md" component="section" aria-label="Observations">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">Observations</Text>
            <Title order={3}>Where your test results come from</Title>
            <Text size="sm" c="dimmed">{profileCount} sources · {observationSets.length} sets — run a set to pull in test results</Text>
          </Stack>
          <Anchor component={Link} href="/quality-explorer/settings">
            <Group gap={6}><span>Open</span><ArrowRight aria-hidden size={16} /></Group>
          </Anchor>
        </Group>
      </Paper>
    </Stack>
  );
}
