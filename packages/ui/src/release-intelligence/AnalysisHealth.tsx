"use client";

import { Alert, Badge, Button, Card, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import {
  parseReleaseSystemFactFindings,
  systemFactFindingPresentation,
  type ReleaseAnalysisHealthView,
} from "@shiplightai/quality-core/release-intelligence";

export function AnalysisHealthSummary({
  detail,
  onViewDetails,
}: {
  readonly detail: ReleaseAnalysisHealthView;
  readonly onViewDetails: () => void;
}): React.ReactElement | null {
  const failed = detail.systemFacts.filter((fact) => fact.status === "failed");
  if (failed.length === 0) return null;
  const findings = failed.flatMap((fact) => parseReleaseSystemFactFindings(fact.findings));
  const first = findings[0];
  const firstPresentation = first ? systemFactFindingPresentation(first) : null;
  const problemCount = findings.length || failed.length;

  return (
    <Alert
      color="red"
      title={`Analysis inputs incomplete: ${problemCount} ${problemCount === 1 ? "problem" : "problems"}`}
    >
      <Stack gap="xs">
        {firstPresentation && (
          <Text size="sm" fw={600}>
            {firstPresentation.title}
          </Text>
        )}
        <Text size="sm">
          {firstPresentation?.explanation ?? first?.message ?? failed[0]?.summary}
        </Text>
        <Button variant="light" color="red" size="xs" w="fit-content" onClick={onViewDetails}>
          View problem details
        </Button>
      </Stack>
    </Alert>
  );
}

export function AnalysisHealth({
  detail,
  onViewDetails,
}: {
  readonly detail: ReleaseAnalysisHealthView;
  readonly onViewDetails: (systemFactId: string) => void;
}): React.ReactElement {
  return (
    <Stack>
      <Card withBorder>
        <Text fw={600}>Analysis health</Text>
        <Text c="dimmed" size="sm" mt={4}>
          These checks show whether repository configuration and workflow inputs were complete
          enough for a trustworthy release decision. They are separate from product Features. Select
          a check to inspect its details.
        </Text>
      </Card>
      {detail.systemFacts.map((fact) => {
        const findings = parseReleaseSystemFactFindings(fact.findings);
        return (
          <UnstyledButton
            key={fact.id}
            w="100%"
            onClick={() => onViewDetails(fact.id)}
            aria-label={`View ${systemFactLabel(fact.factKey)} details`}
          >
            <Card withBorder>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <Text fw={600}>{systemFactLabel(fact.factKey)}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {fact.status === "passed"
                      ? "This check completed without problems."
                      : `${findings.length} ${findings.length === 1 ? "problem prevents" : "problems prevent"} a reliable release decision.`}
                  </Text>
                  <Text size="xs" c="dimmed" mt="xs">
                    {fact.status === "passed"
                      ? "No problems found"
                      : `${findings.length} ${findings.length === 1 ? "problem" : "problems"} found`}{" "}
                    · View details ›
                  </Text>
                </div>
                <Badge color={fact.status === "passed" ? "green" : "red"}>
                  {fact.status === "passed" ? "Healthy" : "Needs attention"}
                </Badge>
              </Group>
            </Card>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}

export function systemFactLabel(key: string): string {
  if (key === "repository-facts-complete") return "Repository configuration";
  if (key === "workflow-evidence-complete") return "Workflow evidence collection";
  return key.replaceAll("-", " ");
}
