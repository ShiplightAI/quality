"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import type { ReleaseDetailView } from "@shiplightai/quality-core/release-intelligence";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useReleaseApi } from "./host";

export function ReleaseRules({
  detail,
  canApprove = false,
}: {
  readonly detail: ReleaseDetailView;
  readonly canApprove?: boolean;
}): React.ReactElement {
  const api = useReleaseApi();
  const router = useRouter();
  const [issueId, setIssueId] = useState<string>();
  const [reason, setReason] = useState("");
  const [approvalError, setApprovalError] = useState<string>();
  const [revokeExceptionId, setRevokeExceptionId] = useState<string>();
  const [revokeError, setRevokeError] = useState<string>();
  const [approvalPending, startApprovalTransition] = useTransition();
  const [revokePending, startRevokeTransition] = useTransition();
  const activeIssueIds = new Set(
    detail.exceptions.filter((item) => item.isActive).map((item) => item.issueId),
  );

  const closeApprovalModal = (): void => {
    setIssueId(undefined);
    setReason("");
    setApprovalError(undefined);
  };
  const closeRevokeModal = (): void => {
    setRevokeExceptionId(undefined);
    setRevokeError(undefined);
  };
  const approve = (): void => {
    if (!issueId || !canApprove) return;
    startApprovalTransition(async () => {
      setApprovalError(undefined);
      const response = await fetch(api(`/releases/${detail.release.id}/exceptions`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issue_id: issueId, reason }),
      });
      const body = (await response.json()) as { readonly title?: string };
      if (!response.ok) {
        setApprovalError(body.title ?? "Could not approve exception.");
        return;
      }
      closeApprovalModal();
      router.refresh();
    });
  };
  const revoke = (): void => {
    if (!revokeExceptionId || !canApprove) return;
    startRevokeTransition(async () => {
      setRevokeError(undefined);
      const response = await fetch(api(`/releases/${detail.release.id}/exceptions`), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exception_id: revokeExceptionId }),
      });
      const body = (await response.json()) as { readonly title?: string };
      if (!response.ok) {
        setRevokeError(body.title ?? "Could not revoke exception.");
        return;
      }
      closeRevokeModal();
      router.refresh();
    });
  };

  return (
    <Stack>
      <Alert color="blue" title="Deterministic decision boundary">
        AI-assisted parsing may organize facts and evidence. Only the recorded rule set converts
        frozen assessments, System Facts, and active exceptions into ALLOW or BLOCK.
      </Alert>
      <Card withBorder>
        <Title order={3}>Policy evaluation</Title>
        {detail.rules.map((rule) => (
          <Group key={rule.id} justify="space-between" align="flex-start" mt="md" wrap="nowrap">
            <div>
              <Text fw={600}>{rule.ruleKey}</Text>
              <Text size="sm" c="dimmed">
                {rule.reason}
              </Text>
            </div>
            <Badge
              color={
                rule.effect === "block" ? "red" : rule.effect === "warning" ? "yellow" : "green"
              }
            >
              {rule.status} · {rule.effect}
            </Badge>
          </Group>
        ))}
      </Card>
      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Issue</Table.Th>
                <Table.Th>Gate effect</Table.Th>
                <Table.Th>Exception</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.issues.map((issue) => (
                <Table.Tr key={issue.id}>
                  <Table.Td>
                    <Text fw={600}>{issue.title}</Text>
                    <Text size="xs" c="dimmed">
                      {issue.reason}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={issue.blocksWithoutException ? "red" : "yellow"}>
                      {issue.blocksWithoutException ? "block" : "warning"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {activeIssueIds.has(issue.id) ? (
                      <Badge color="blue">active</Badge>
                    ) : canApprove && issue.assessmentId ? (
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => {
                          setReason("");
                          setApprovalError(undefined);
                          setIssueId(issue.id);
                        }}
                      >
                        Approve exception
                      </Button>
                    ) : issue.assessmentId ? (
                      <Text size="sm" c="dimmed">
                        {canApprove ? "Approval unavailable" : "Owner approval required"}
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed">
                        System gate cannot be excepted
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
      {detail.exceptions.length > 0 && (
        <Card withBorder>
          <Title order={3}>Exception history</Title>
          {detail.exceptions.map((item) => (
            <Group key={item.id} justify="space-between" mt="md">
              <div>
                <Text fw={600}>{item.reason}</Text>
                <Text size="xs" c="dimmed">
                  Expires {formatTimestamp(item.expiresAt)}
                  {item.revokedAt ? ` · revoked ${formatTimestamp(item.revokedAt)}` : ""}
                </Text>
              </div>
              {canApprove && item.isActive && (
                <Button
                  size="xs"
                  color="red"
                  variant="subtle"
                  onClick={() => {
                    setRevokeError(undefined);
                    setRevokeExceptionId(item.id);
                  }}
                >
                  Revoke
                </Button>
              )}
            </Group>
          ))}
        </Card>
      )}
      <Modal
        opened={Boolean(issueId)}
        onClose={closeApprovalModal}
        title="Approve release-scoped exception"
        centered
      >
        <Stack>
          <Alert color="yellow">
            This does not mark the Behavior verified. It is considered only by a new analysis
            attempt and expires after 24 hours.
          </Alert>
          <Textarea
            label="Reason"
            minRows={4}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          {approvalError && <Alert color="red">{approvalError}</Alert>}
          <Group justify="flex-end">
            <Button type="button" variant="default" onClick={closeApprovalModal}>
              Cancel
            </Button>
            <Button
              loading={approvalPending}
              disabled={reason.trim().length < 10}
              onClick={approve}
            >
              Approve exception
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={Boolean(revokeExceptionId)}
        onClose={closeRevokeModal}
        title="Revoke release exception?"
        centered
      >
        <Stack>
          <Text size="sm">
            The exception will stop applying to future analyses. This action cannot be undone.
          </Text>
          {revokeError && <Alert color="red">{revokeError}</Alert>}
          <Group justify="flex-end">
            <Button type="button" variant="default" onClick={closeRevokeModal}>
              Cancel
            </Button>
            <Button color="red" loading={revokePending} onClick={revoke}>
              Revoke exception
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US");
}
