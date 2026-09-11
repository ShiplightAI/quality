"use client";

import {
  Anchor,
  Box,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  githubSourceUrl,
  type ReleaseFeatureBrowserView,
} from "@shiplightai/quality-core/release-intelligence";
import { useRef, useState } from "react";
import "./FeatureBrowser.css";

type Filter = "all" | "issues";

export function FeatureBrowser({
  detail,
  onViewAssessment,
}: {
  readonly detail: ReleaseFeatureBrowserView;
  readonly onViewAssessment: (assessmentId: string) => void;
}): React.ReactElement {
  const [selectedFeatureId, setSelectedFeatureId] = useState(detail.features[0]?.id ?? "");
  const [filter, setFilter] = useState<Filter>("all");
  const behaviorListRef = useRef<HTMLDivElement>(null);

  if (detail.features.length === 0) {
    return (
      <Paper withBorder radius="md" p="lg">
        <Title order={3} size="h4">
          No Features compiled
        </Title>
        <Text c="dimmed" mt="xs" size="sm">
          Repository facts were absent, invalid, or the analysis is still running. This is not
          treated as evidence that the release is safe.
        </Text>
      </Paper>
    );
  }

  const behaviorsByFeature = new Map<string, typeof detail.behaviors>();
  for (const item of detail.behaviors) {
    behaviorsByFeature.set(item.featureId, [...(behaviorsByFeature.get(item.featureId) ?? []), item]);
  }
  const assessmentByBehavior = new Map(
    detail.assessments.map((item) => [item.behaviorSnapshotId, item]),
  );
  const issueByAssessment = new Map(
    detail.issues.flatMap((item) =>
      item.assessmentId ? ([[item.assessmentId, item]] as const) : [],
    ),
  );
  const evidenceCountByAssessment = new Map<string, number>();
  for (const link of detail.assessmentEvidence) {
    evidenceCountByAssessment.set(
      link.assessmentId,
      (evidenceCountByAssessment.get(link.assessmentId) ?? 0) + 1,
    );
  }

  const selectedFeature =
    detail.features.find((feature) => feature.id === selectedFeatureId) ?? detail.features[0]!;
  const selectedBehaviors = behaviorsByFeature.get(selectedFeature.id) ?? [];
  const selectedAssessments = selectedBehaviors.flatMap(({ behavior }) => {
    const assessment = assessmentByBehavior.get(behavior.id);
    return assessment ? [assessment] : [];
  });
  const visibleBehaviors = selectedBehaviors.filter(({ behavior }) => {
    if (filter === "all") return true;
    const assessment = assessmentByBehavior.get(behavior.id);
    return assessment && !["verified", "not_applicable"].includes(assessment.status);
  });
  const featureSource = selectedFeature.sourceRefs[0];
  const verified = selectedAssessments.filter((item) => item.status === "verified").length;
  const failed = selectedAssessments.filter((item) => item.status === "failed").length;
  const insufficient = selectedAssessments.filter(
    (item) => item.status === "insufficient_proof",
  ).length;
  const selectFeature = (featureId: string | null): void => {
    if (!featureId) return;
    setSelectedFeatureId(featureId);
    behaviorListRef.current?.scrollTo({ top: 0 });
  };
  const selectFilter = (value: string): void => {
    setFilter(value as Filter);
    behaviorListRef.current?.scrollTo({ top: 0 });
  };

  return (
    <Stack gap="md" className="ri-feature-root">
      <Group justify="space-between" align="flex-end" wrap="wrap" className="ri-feature-header">
        <div>
          <Title order={2} size="h4">Feature assessment</Title>
          <Text size="sm" c="dimmed" mt={3}>
            Every Feature is evaluated as expected Behaviors and supporting evidence.
          </Text>
        </div>
        <SegmentedControl
          value={filter}
          onChange={selectFilter}
          data={[
            { label: "All behaviors", value: "all" },
            { label: "Needs attention", value: "issues" },
          ]}
          size="xs"
        />
      </Group>

      <Select
        label="Feature"
        value={selectedFeature.id}
        onChange={selectFeature}
        data={detail.features.map((feature) => ({ value: feature.id, label: feature.name }))}
        allowDeselect={false}
        className="ri-feature-mobile-select"
      />

      <Box className="ri-feature-layout">
        <Paper component="nav" withBorder radius="md" p={0} aria-label="Features" className="ri-feature-nav">
          <Stack gap={2} p="md">
            <Text fw={600} size="sm">{detail.features.length} Features</Text>
            <Text c="dimmed" size="xs">{detail.behaviors.length} expected Behaviors</Text>
          </Stack>
          <div className="ri-feature-nav-list">
            {detail.features.map((feature) => {
              const behaviors = behaviorsByFeature.get(feature.id) ?? [];
              const assessments = behaviors.flatMap(({ behavior }) => {
                const assessment = assessmentByBehavior.get(behavior.id);
                return assessment ? [assessment] : [];
              });
              const issues = assessments.filter(
                (item) => !["verified", "not_applicable"].includes(item.status),
              ).length;
              const selected = feature.id === selectedFeature.id;
              return (
                <UnstyledButton
                  key={feature.id}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => selectFeature(feature.id)}
                  w="100%"
                  px="md"
                  py="sm"
                  mih={56}
                  className="ri-feature-option"
                >
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <div>
                      <Text fw={500} size="sm">{feature.name}</Text>
                      <Text size="xs" c="dimmed" mt={2}>{behaviors.length} Behaviors</Text>
                    </div>
                    <Text size="xs" fw={600} c={issues > 0 ? "orange" : "green"} ta="right">
                      {issues > 0 ? `${issues} issue${issues === 1 ? "" : "s"}` : "Clear"}
                    </Text>
                  </Group>
                </UnstyledButton>
              );
            })}
          </div>
        </Paper>

        <Stack gap="sm" miw={0} className="ri-feature-detail-column">
          <Paper withBorder radius="md" p="lg" className="ri-feature-summary">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Title order={3} size="h4">{selectedFeature.name}</Title>
                <Text size="sm" c="dimmed" mt={3}>{selectedFeature.description}</Text>
              </div>
              {featureSource && (
                <Anchor
                  href={githubSourceUrl(detail.repository, detail.release.commitSha, featureSource)}
                  target="_blank"
                  size="sm"
                  style={{ flexShrink: 0 }}
                >
                  Feature source ↗
                </Anchor>
              )}
            </Group>
            <Group gap="lg" mt="md" pt="sm" className="ri-feature-metrics">
              <SummaryValue value={verified} label="verified" />
              <SummaryValue value={failed} label="failed" />
              <SummaryValue value={insufficient} label="insufficient proof" />
              <SummaryValue
                value={selectedAssessments.reduce(
                  (total, assessment) => total + (evidenceCountByAssessment.get(assessment.id) ?? 0),
                  0,
                )}
                label="evidence records"
              />
            </Group>
          </Paper>

          <div ref={behaviorListRef} className="ri-feature-behavior-list">
            {visibleBehaviors.length === 0 ? (
              <Paper withBorder radius="md" p="lg">
                <Text size="sm" c="dimmed">No Behaviors match this filter.</Text>
              </Paper>
            ) : (
              visibleBehaviors.map(({ behavior }) => {
                const assessment = assessmentByBehavior.get(behavior.id);
                const issue = assessment ? issueByAssessment.get(assessment.id) : undefined;
                const evidenceCount = assessment
                  ? (evidenceCountByAssessment.get(assessment.id) ?? 0)
                  : 0;
                const status = assessment?.status ?? "pending";
                const color =
                  status === "verified"
                    ? "green"
                    : status === "failed" || status === "check_error"
                      ? "red"
                      : "orange";
                const subtitle = assessment?.missingProof.length
                  ? `Missing proof: ${assessment.missingProof.join(", ")}`
                  : assessment
                    ? `${evidenceCount} evidence record${evidenceCount === 1 ? "" : "s"} · ${assessment.runtimeStatus.replaceAll("_", " ")}`
                    : "Assessment pending";
                return (
                  <UnstyledButton
                    key={behavior.id}
                    onClick={() => assessment && onViewAssessment(assessment.id)}
                    disabled={!assessment}
                    w="100%"
                    className="ri-feature-behavior-button"
                  >
                    <Paper withBorder radius="md" p="md">
                      <Group align="flex-start" wrap="nowrap" gap="sm">
                        <Text c={color} fw={700} w={18} ta="center" aria-hidden>
                          {status === "verified" ? "✓" : status === "failed" ? "×" : "!"}
                        </Text>
                        <Stack gap={3} style={{ flex: 1 }}>
                          <Text fw={500} size="sm">{behavior.title}</Text>
                          <Text size="xs" c="dimmed" lh={1.4}>{subtitle}</Text>
                          {issue && <Text size="xs" c={color}>{issue.recommendedAction}</Text>}
                        </Stack>
                        <Text size="xs" c="dimmed" tt="capitalize" ta="right">
                          {behavior.origin} ›
                        </Text>
                      </Group>
                    </Paper>
                  </UnstyledButton>
                );
              })
            )}
          </div>
        </Stack>
      </Box>
    </Stack>
  );
}

function SummaryValue({ value, label }: { readonly value: number; readonly label: string }): React.ReactElement {
  return (
    <Text size="xs" c="dimmed">
      <Text component="span" inherit fw={600} c="var(--mantine-color-text)">{value}</Text>{" "}
      {label}
    </Text>
  );
}
