"use client";

import {
  Alert,
  Anchor,
  Badge,
  Box,
  Code,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  githubCommitUrl,
  type ReleaseDetailView,
} from "@shiplightai/quality-core/release-intelligence";
import { useState } from "react";
import { AnalysisAutoRefresh } from "./AnalysisAutoRefresh";
import { AnalysisHealthSummary } from "./AnalysisHealth";
import { AnalysisHistory } from "./AnalysisHistory";
import { FeatureBrowser } from "./FeatureBrowser";
import { IssueEvidenceDrawer } from "./IssueEvidenceDrawer";
import { ReleaseRules } from "./ReleaseRules";
import { RunsArtifacts } from "./RunsArtifacts";
import { SystemFactDrawer } from "./SystemFactDrawer";
import "./ReleaseDetail.css";

interface ReleaseSummaryView {
  readonly featureCount?: number;
  readonly behaviorCount?: number;
  readonly verifiedCount?: number;
  readonly issueCount?: number;
}

export function ReleaseDetail({
  detail,
  canApproveExceptions = false,
}: {
  readonly detail: ReleaseDetailView;
  readonly canApproveExceptions?: boolean;
}): React.ReactElement {
  const current = detail.attempts[0];
  const decision = current?.decision ?? current?.status ?? "queued";
  const normalizedDecision = decision.toLowerCase();
  const decisionColor =
    normalizedDecision === "allow"
      ? "green"
      : normalizedDecision === "block" || normalizedDecision === "error"
        ? "red"
        : "yellow";
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [systemFactId, setSystemFactId] = useState<string | null>(null);

  return (
    <Stack gap="lg" className="ri-detail-workspace">
      <AnalysisAutoRefresh
        active={Boolean(
          current && !["allow", "block", "inconclusive", "error"].includes(current.status),
        )}
      />
      <Paper withBorder radius="md" p="lg" className="ri-detail-release-context">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <Stack gap={6}>
            <Group gap="xs">
              <Badge color={decisionColor} size="lg" variant="light">
                {decision.replaceAll("_", " ")}
              </Badge>
              <Badge variant="outline">{detail.release.environment}</Badge>
            </Group>
            <Text fw={600} size="lg">
              {detail.release.workflowName}
            </Text>
            <Text size="sm" c="dimmed">
              Analysis of the exact workflow run and commit. Publish status changes only when an
              explicit publish result is recorded.
            </Text>
          </Stack>
          <Group gap="xl" align="flex-start">
            <StatusFact label="Analysis" value={current?.status ?? "queued"} />
            <StatusFact label="Publish" value={detail.release.publishStatus} />
          </Group>
        </Group>
        <Divider my="md" />
        <Group gap="xs" wrap="wrap">
          <Text size="sm" c="dimmed">
            {detail.repository}
          </Text>
          <Text c="dimmed">·</Text>
          <Anchor href={detail.release.workflowUrl} target="_blank" size="sm">
            Workflow run {detail.release.workflowRunId}
          </Anchor>
          <Text c="dimmed">·</Text>
          <Anchor
            href={githubCommitUrl(detail.repository, detail.release.commitSha)}
            target="_blank"
            size="sm"
          >
            <Code>{detail.release.commitSha.slice(0, 12)}</Code>
          </Anchor>
          <Text c="dimmed">·</Text>
          <Text size="sm">
            {detail.release.components.length > 0
              ? detail.release.components.join(", ")
              : "All components"}
          </Text>
          {current && (
            <>
              <Text c="dimmed">·</Text>
              <Text size="sm">Attempt {current.attemptNumber}</Text>
            </>
          )}
        </Group>
      </Paper>
      <Tabs defaultValue="summary" keepMounted={false} className="ri-detail-tabs">
        <Tabs.List className="ri-detail-tab-list">
          <Tabs.Tab value="summary">Summary</Tabs.Tab>
          <Tabs.Tab value="features">Features</Tabs.Tab>
          <Tabs.Tab value="artifacts">Runs &amp; Artifacts</Tabs.Tab>
          <Tabs.Tab value="rules">Release Rules</Tabs.Tab>
          <Tabs.Tab value="history">Analysis History</Tabs.Tab>
        </Tabs.List>
        <div className="ri-detail-tab-content">
          <Tabs.Panel value="summary" pt="lg">
            <Summary detail={detail} />
          </Tabs.Panel>
          <Tabs.Panel value="features" pt="lg" className="ri-detail-feature-panel">
            <FeatureBrowser detail={detail} onViewAssessment={setAssessmentId} />
          </Tabs.Panel>
          <Tabs.Panel value="artifacts" pt="lg">
            <RunsArtifacts detail={detail} onViewSystemFact={setSystemFactId} />
          </Tabs.Panel>
          <Tabs.Panel value="rules" pt="lg">
            <ReleaseRules detail={detail} canApprove={canApproveExceptions} />
          </Tabs.Panel>
          <Tabs.Panel value="history" pt="lg">
            <AnalysisHistory detail={detail} />
          </Tabs.Panel>
        </div>
      </Tabs>
      <IssueEvidenceDrawer
        detail={detail}
        assessmentId={assessmentId}
        onClose={() => setAssessmentId(null)}
      />
      <SystemFactDrawer
        detail={detail}
        systemFactId={systemFactId}
        onClose={() => setSystemFactId(null)}
      />
    </Stack>
  );
}

function StatusFact({ label, value }: { readonly label: string; readonly value: string }) {
  const color =
    value === "allow" || value === "published" || value === "verified"
      ? "green"
      : value === "block" || value === "failed" || value === "error"
        ? "red"
        : "yellow";
  return (
    <Stack gap={4} miw={92}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Badge color={color} variant="light" w="fit-content">
        {value.replaceAll("_", " ")}
      </Badge>
    </Stack>
  );
}

function Summary({ detail }: { readonly detail: ReleaseDetailView }): React.ReactElement {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedSystemFactId, setSelectedSystemFactId] = useState<string | null>(null);
  const selectedIssue = detail.issues.find((item) => item.id === selectedIssueId);
  const firstFailedSystemFactId =
    detail.systemFacts.find((item) => item.status === "failed")?.id ?? null;
  const storedSummary = detail.attempts[0]?.summary;
  const summary = parseReleaseSummary(storedSummary);
  const componentDiagnostic = detail.attempts[0]?.diagnostics.find(
    (diagnostic) => diagnostic.code === "unknown_release_component",
  );

  return (
    <>
      <Stack gap="md">
        <AnalysisHealthSummary
          detail={detail}
          onViewDetails={() => setSelectedSystemFactId(firstFailedSystemFactId)}
        />
        {storedSummary !== null && storedSummary !== undefined && summary === null && (
          <Alert color="yellow" title="Analysis summary is unavailable">
            The stored summary has an unexpected shape. Detailed evidence remains available below.
          </Alert>
        )}
        {typeof componentDiagnostic?.message === "string" && (
          <Alert color="red" title="Release scope could not be resolved">
            {componentDiagnostic.message}
          </Alert>
        )}
        <Paper withBorder radius="md" p="lg">
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <SummaryStat label="Features" value={summary?.featureCount ?? detail.features.length} />
            <SummaryStat
              label="Behaviors"
              value={summary?.behaviorCount ?? detail.assessments.length}
            />
            <SummaryStat label="Verified" value={summary?.verifiedCount ?? 0} />
            <SummaryStat label="Issues" value={summary?.issueCount ?? detail.issues.length} />
          </SimpleGrid>
        </Paper>
        <Paper withBorder radius="md" p="lg">
          <Title order={2} size="h4">
            Decision basis
          </Title>
          {detail.rules.length === 0 ? (
            <Text c="dimmed" mt="sm">
              {detail.attempts[0]?.status === "inconclusive"
                ? "No policy rules were evaluated because analysis was inconclusive."
                : "Rules will appear when analysis finishes."}
            </Text>
          ) : (
            <Stack gap={0} mt="sm">
              {detail.rules.map((rule) => (
                <Group
                  key={rule.id}
                  justify="space-between"
                  align="flex-start"
                  wrap="nowrap"
                  py="sm"
                  className="ri-detail-decision-row"
                >
                  <div>
                    <Text fw={500} size="sm">
                      {rule.ruleKey}
                    </Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      {rule.reason}
                    </Text>
                  </div>
                  <Text
                    size="xs"
                    fw={600}
                    c={
                      rule.effect === "block"
                        ? "red"
                        : rule.effect === "warning"
                          ? "orange"
                          : "green"
                    }
                  >
                    {rule.status.toUpperCase()}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Paper>
        <div>
          <Group justify="space-between" align="flex-end" mb="sm">
            <Title order={2} size="h4">
              Prioritized issues
            </Title>
            {detail.issues.length > 0 && (
              <Text size="xs" c="dimmed">
                Select an issue to inspect its details
              </Text>
            )}
          </Group>
          {detail.issues.length === 0 ? (
            <Paper withBorder radius="md" p="lg">
              <Text c="dimmed" size="sm">
                No issues in the selected attempt.
              </Text>
            </Paper>
          ) : (
            <Stack gap="xs">
              {detail.issues.map((issue) => {
                const featureName = getIssueFeatureName(detail, issue.assessmentId);
                return (
                  <UnstyledButton
                    key={issue.id}
                    onClick={() => {
                      setSelectedSystemFactId(null);
                      setSelectedIssueId(issue.id);
                    }}
                    w="100%"
                  >
                    <Paper withBorder radius="md" p="md">
                      <Group gap="md" align="flex-start" wrap="nowrap">
                        <Box
                          w={6}
                          h={40}
                          bg={issue.blocksWithoutException ? "red" : "orange"}
                          style={{ borderRadius: "var(--mantine-radius-xl)", flexShrink: 0 }}
                        />
                        <Stack gap={3} style={{ flex: 1 }}>
                          <Text fw={500} size="sm">
                            {featureName ? `${featureName} / ${issue.title}` : issue.title}
                          </Text>
                          <Text size="xs" c="dimmed" lh={1.45}>
                            {issue.reason}
                          </Text>
                        </Stack>
                        <Text
                          size="xs"
                          fw={600}
                          c={issue.blocksWithoutException ? "red" : "orange"}
                          tt="uppercase"
                          ta="right"
                        >
                          {issue.kind.replaceAll("_", " ")} ›
                        </Text>
                      </Group>
                    </Paper>
                  </UnstyledButton>
                );
              })}
            </Stack>
          )}
        </div>
      </Stack>
      <IssueEvidenceDrawer
        detail={detail}
        issueId={selectedIssue?.assessmentId ? selectedIssueId : null}
        onClose={() => setSelectedIssueId(null)}
      />
      <SystemFactDrawer
        detail={detail}
        issueId={selectedIssue?.systemFactId ? selectedIssueId : null}
        systemFactId={selectedSystemFactId}
        onClose={() => {
          setSelectedIssueId(null);
          setSelectedSystemFactId(null);
        }}
      />
    </>
  );
}

function getIssueFeatureName(detail: ReleaseDetailView, assessmentId: string | null) {
  if (!assessmentId) return undefined;
  const assessment = detail.assessments.find((item) => item.id === assessmentId);
  const behavior = detail.behaviors.find(
    (item) => item.behavior.id === assessment?.behaviorSnapshotId,
  );
  return detail.features.find((item) => item.id === behavior?.featureId)?.name;
}

function SummaryStat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="xl" fw={600}>
        {value}
      </Text>
    </Stack>
  );
}

function parseReleaseSummary(value: unknown): ReleaseSummaryView | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = ["featureCount", "behaviorCount", "verifiedCount", "issueCount"] as const;
  if (
    keys.some(
      (key) =>
        record[key] !== undefined &&
        !(typeof record[key] === "number" && Number.isInteger(record[key]) && record[key] >= 0),
    )
  ) {
    return null;
  }
  return Object.fromEntries(
    keys.flatMap((key) => (record[key] === undefined ? [] : [[key, record[key]]])),
  ) as ReleaseSummaryView;
}
