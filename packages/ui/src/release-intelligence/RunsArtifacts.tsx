"use client";

import { Anchor, Badge, Card, Stack, Table, Text, Title } from "@mantine/core";
import {
  githubSourceUrl,
  type ReleaseEvidenceInputsView,
} from "@shiplightai/quality-core/release-intelligence";
import { AnalysisHealth } from "./AnalysisHealth";

export function RunsArtifacts({
  detail,
  onViewSystemFact,
}: {
  readonly detail: ReleaseEvidenceInputsView;
  readonly onViewSystemFact: (systemFactId: string) => void;
}): React.ReactElement {
  return (
    <Stack>
      <AnalysisHealth detail={detail} onViewDetails={onViewSystemFact} />
      <Card withBorder>
        <Title order={3}>Evidence input health</Title>
        <Text c="dimmed" size="sm" mt="xs">
          Evidence is stored independently and may support one or more Behaviors. Availability and
          commit identity do not by themselves prove a Behavior.
        </Text>
      </Card>
      {detail.evidence.length === 0 ? (
        <Card withBorder>
          <Text c="dimmed">No evidence has been collected for the selected attempt.</Text>
        </Card>
      ) : (
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Input</Table.Th>
                  <Table.Th>Kind</Table.Th>
                  <Table.Th>Runtime</Table.Th>
                  <Table.Th>Identity</Table.Th>
                  <Table.Th>Collection</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {detail.evidence.map((item) => {
                  const href = item.fileRef?.path
                    ? githubSourceUrl(detail.repository, detail.release.commitSha, item.fileRef)
                    : item.providerRef?.startsWith("https://")
                      ? item.providerRef
                      : null;
                  return (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        {href ? (
                          <Anchor href={href} target="_blank" rel="noreferrer">
                            {item.sourceName}
                          </Anchor>
                        ) : (
                          item.sourceName
                        )}
                      </Table.Td>
                      <Table.Td>{item.kind}</Table.Td>
                      <Table.Td>
                        <EvidenceBadge value={item.runtimeStatus} />
                      </Table.Td>
                      <Table.Td>
                        <EvidenceBadge value={item.identityStatus} />
                      </Table.Td>
                      <Table.Td>
                        <EvidenceBadge value={item.collectionStatus} />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}
    </Stack>
  );
}

function EvidenceBadge({ value }: { readonly value: string }): React.ReactElement {
  const color =
    value === "passed" || value === "matched" || value === "available"
      ? "green"
      : value === "failed" || value === "mismatched" || value === "parse_error"
        ? "red"
        : "yellow";
  return (
    <Badge color={color} variant="light">
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
