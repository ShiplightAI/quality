"use client";

import { Clipboard, PanelRightClose, TrendingUp } from "lucide-react";
import { ActionIcon, Badge, Button, Code, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import type { GenerateRecommendationsResponse, RankedRecommendationRecord } from "../lib/ranked-recommendations";

interface RecommendationsPanelProps {
  readonly payload: GenerateRecommendationsResponse;
  onClose(): void;
}

function liftLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function observationStateLabel(value: RankedRecommendationRecord["observed_state"]): string {
  switch (value) {
    case "fail":
      return "Failing";
    case "error":
      return "Errored";
    case "partial":
      return "Partial";
    case "skipped":
      return "Skipped";
    case "unobserved":
      return "Unobserved";
    default:
      return "Open";
  }
}

function displayOutputPath(payload: GenerateRecommendationsResponse): string {
  return payload.path.startsWith(`${payload.file.project_root}/`)
    ? payload.path.slice(payload.file.project_root.length + 1)
    : payload.path;
}

export function RecommendationsPanel({
  payload,
  onClose
}: RecommendationsPanelProps): React.ReactElement {
  const [copiedRecommendationId, setCopiedRecommendationId] = useState<string>();
  const recommendationCount = payload.file.recommendations.length;
  const scopeDescription = payload.file.scope.description;
  const qualityScoreReason = payload.file.quality_score_availability?.reason;

  async function copyRecommendationPrompt(recommendation: RankedRecommendationRecord): Promise<void> {
    if (navigator.clipboard === undefined) {
      return;
    }

    void navigator.clipboard.writeText(recommendation.prompt)
      .then(() => {
        setCopiedRecommendationId(recommendation.recommendation_id);
        window.setTimeout(() => setCopiedRecommendationId(undefined), 1500);
      })
      .catch(() => undefined);
  }

  return (
    <aside className="workspace-detail-panel" aria-label="Recommendations panel">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text size="xs" c="dimmed" tt="uppercase">Recommendations</Text>
          <Title order={2}>Ranked fix queue</Title>
          <Text size="sm" c="dimmed">
            {payload.file.observation_set_name ?? "Static scores"} for <strong>{payload.file.scope.name}</strong>
            {scopeDescription === undefined ? "" : ` · ${scopeDescription}`}
          </Text>
        </Stack>
        <ActionIcon aria-label="Close recommendations panel" variant="subtle" color="gray" onClick={onClose}>
          <PanelRightClose aria-hidden size={18} />
        </ActionIcon>
      </Group>

      <Group gap="sm" mt="sm">
        <Text size="sm">{recommendationCount} ranked recommendation{recommendationCount === 1 ? "" : "s"}</Text>
        {payload.file.observation_set_id === undefined ? null : (
          <Code>{payload.file.observation_set_id}</Code>
        )}
      </Group>

      <Group gap="md" mt="xs">
        <Text size="sm" c="dimmed">Generated {new Date(payload.file.generated_at).toLocaleString()}</Text>
        <Text size="sm" c="dimmed">{displayOutputPath(payload)}</Text>
        {payload.file.runtime_review?.quality_score === undefined ? (
          <Text size="sm" c="dimmed">
            Quality score unavailable{qualityScoreReason === undefined ? "" : `: ${qualityScoreReason}`}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">Score {payload.file.runtime_review.quality_score} / 100</Text>
        )}
      </Group>

      {recommendationCount === 0 ? (
        <Text c="dimmed" mt="md">All evaluated runtime checks passed in this generated review file.</Text>
      ) : (
        <Stack gap="sm" mt="md" aria-label="Ranked recommendations">
          {payload.file.recommendations.map((recommendation) => (
            <Paper p="md" key={recommendation.recommendation_id}>
              <Group justify="space-between" align="flex-start">
                <Stack gap={0}>
                  <Text fw={600}>{recommendation.expectation_title}</Text>
                  <Text size="sm" c="dimmed">{recommendation.target_name}</Text>
                </Stack>
                <Group gap={6}>
                  <Badge color="gray">#{recommendation.rank}</Badge>
                  <Badge color="green" leftSection={<TrendingUp aria-hidden size={12} />}>+{liftLabel(recommendation.score_lift)} pts</Badge>
                  <Badge color="gray">{observationStateLabel(recommendation.observed_state)}</Badge>
                </Group>
              </Group>

              <Text size="sm" mt="xs">{recommendation.reason}</Text>
              <Text size="sm" mt={4}><strong>Next action:</strong> {recommendation.next_action}</Text>

              <Group gap="md" mt="xs">
                <Text size="sm" c="dimmed">Projected score: {recommendation.projected_score} / 100</Text>
                <Text size="sm" c="dimmed">Priority: {recommendation.priority ?? "—"}</Text>
                <Text size="sm" c="dimmed">Prompt source: {recommendation.prompt_source}</Text>
              </Group>

              {recommendation.proof_source_paths.length > 0 ? (
                <Group gap={6} mt="xs">
                  {recommendation.proof_source_paths.map((proofSourcePath) => (
                    <Code key={proofSourcePath}>{proofSourcePath}</Code>
                  ))}
                </Group>
              ) : null}

              {recommendation.verification_commands.length > 0 ? (
                <Stack gap={4} mt="xs">
                  {recommendation.verification_commands.map((command) => (
                    <Code key={command}>{command}</Code>
                  ))}
                </Stack>
              ) : null}

              <Group mt="md">
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<Clipboard aria-hidden size={16} />}
                  onClick={() => void copyRecommendationPrompt(recommendation)}
                >
                  {copiedRecommendationId === recommendation.recommendation_id ? "Copied" : "Copy coding-agent prompt"}
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
    </aside>
  );
}
