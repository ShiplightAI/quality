import { Badge, Card, Group, Stack, Text, Timeline, Title } from "@mantine/core";
import type { ReleaseAnalysisHistoryView } from "@shiplightai/quality-core/release-intelligence";

export function AnalysisHistory({
  detail,
}: {
  readonly detail: ReleaseAnalysisHistoryView;
}): React.ReactElement {
  return (
    <Card withBorder>
      <Title order={3}>Immutable analysis attempts</Title>
      <Text size="sm" c="dimmed" mt="xs" mb="lg">
        Every analysis is an immutable attempt. Publish status is recorded independently.
      </Text>
      <Timeline active={-1} bulletSize={24}>
        {detail.attempts.map((attempt) => (
          <Timeline.Item
            key={attempt.id}
            title={
              <Group gap="xs">
                <Text fw={600}>Attempt {attempt.attemptNumber}</Text>
                {attempt.triggerType === "workflow_gate" && (
                  <Badge size="xs" variant="outline">
                    workflow
                  </Badge>
                )}
                {attempt.triggerType === "historical_import" && (
                  <Badge size="xs" variant="outline">
                    historical import
                  </Badge>
                )}
                {attempt.triggerType === "manual_reanalysis" && (
                  <Badge size="xs" variant="outline">
                    manual re-analysis
                  </Badge>
                )}
                <Badge
                  size="xs"
                  color={
                    attempt.status === "allow"
                      ? "green"
                      : attempt.status === "block" || attempt.status === "error"
                        ? "red"
                        : "yellow"
                  }
                >
                  {attempt.status}
                </Badge>
              </Group>
            }
          >
            <Stack gap={2} mt={4}>
              <Text size="sm" c="dimmed">
                {attempt.triggerType.replaceAll("_", " ")} · analyzer {attempt.analyzerVersion}
              </Text>
              <Text size="sm">
                Started {formatTimestamp(attempt.startedAt)} · completed{" "}
                {formatTimestamp(attempt.completedAt)}
              </Text>
              {attempt.factSetHash && (
                <Text size="xs" ff="monospace" c="dimmed">
                  facts {attempt.factSetHash.slice(0, 12)}
                </Text>
              )}
            </Stack>
          </Timeline.Item>
        ))}
      </Timeline>
    </Card>
  );
}

function formatTimestamp(value: string | null): string {
  return value === null ? "not yet" : new Date(value).toLocaleString("en-US");
}
