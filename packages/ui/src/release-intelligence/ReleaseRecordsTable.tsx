"use client";

import { Anchor, Badge, Group, Stack, Table, Text } from "@mantine/core";
import { githubCommitUrl, type ReleaseListItemView } from "@shiplightai/quality-core/release-intelligence";
import { usePathname, useSearchParams } from "next/navigation";
import { useReleaseRoute } from "./host";

export function ReleaseRecordsTable({
  records,
  nextCursor,
}: {
  readonly records: readonly ReleaseListItemView[];
  readonly nextCursor: string | null;
}): React.ReactElement {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const releaseRoute = useReleaseRoute();
  const olderHref = nextCursor
    ? (() => {
        const next = new URLSearchParams(searchParams.toString());
        next.set("cursor", nextCursor);
        return `${pathname}?${next.toString()}`;
      })()
    : null;

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Release checks are ordered newest first.
      </Text>
      <Table.ScrollContainer minWidth={900}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Repository</Table.Th>
              <Table.Th>Workflow</Table.Th>
              <Table.Th>Commit</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th>Analysis</Table.Th>
              <Table.Th>Publish</Table.Th>
              <Table.Th>Created</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {records.map((record) => (
              <Table.Tr key={record.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {record.repository}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Stack gap={1}>
                    <Anchor href={releaseRoute(`/releases/${record.id}`)} fw={500} size="sm">
                      {record.workflowName}
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      Run {record.workflowRunId}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Anchor
                    ff="monospace"
                    size="sm"
                    href={githubCommitUrl(record.repository, record.commitSha)}
                    target="_blank"
                  >
                    {record.commitSha.slice(0, 8)}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Stack gap={1}>
                    <Badge variant="light" w="fit-content">
                      {record.environment}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {record.components.length > 0
                        ? record.components.join(", ")
                        : "All components"}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <StatusBadge
                    value={
                      record.latestAttempt?.decision ?? record.latestAttempt?.status ?? "queued"
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <StatusBadge value={record.publishStatus} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {new Date(record.createdAt).toLocaleString("en-US")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {olderHref && (
        <Group justify="flex-end">
          <Anchor href={olderHref} size="sm">
            Older release checks →
          </Anchor>
        </Group>
      )}
    </Stack>
  );
}

function StatusBadge({ value }: { readonly value: string }): React.ReactElement {
  const normalized = value.toLowerCase();
  const color =
    normalized === "allow" || normalized === "published"
      ? "green"
      : normalized === "block" || normalized === "failed" || normalized === "error"
        ? "red"
        : "yellow";
  return (
    <Badge color={color} variant="light">
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
