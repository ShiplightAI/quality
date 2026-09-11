"use client";

import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useReleaseApi } from "./host";

export function AnalyzeWorkflowModal({
  releaseId,
  workflowUrl,
  components,
}: {
  readonly releaseId: string;
  readonly workflowUrl: string;
  readonly components: readonly string[];
}): React.ReactElement {
  const api = useReleaseApi();
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [reference, setReference] = useState(workflowUrl);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [pending, startTransition] = useTransition();
  const close = (): void => {
    setOpened(false);
    setError(undefined);
    setSuccess(undefined);
  };

  return (
    <>
      <Button variant="light" onClick={() => setOpened(true)}>
        Analyze workflow again
      </Button>
      <Modal opened={opened} onClose={close} title="Analyze a release workflow again" centered>
        <Stack>
          <Text size="sm" c="dimmed">
            This creates a new immutable Analysis Attempt. It does not rewrite earlier attempts or
            the publish result.
          </Text>
          <TextInput
            label="GitHub workflow run URL or ID"
            value={reference}
            onChange={(event) => setReference(event.currentTarget.value)}
          />
          <TextInput
            label="Components"
            value={components.length > 0 ? components.join(", ") : "All components"}
            readOnly
          />
          {error && <Alert color="red">{error}</Alert>}
          {success && <Alert color="green">{success}</Alert>}
          <Group justify="flex-end">
            <Button type="button" variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={reference.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  setError(undefined);
                  setSuccess(undefined);
                  const response = await fetch(api(`/releases/${releaseId}/attempts`), {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      workflow_url_or_id: reference,
                      idempotency_key: globalThis.crypto.randomUUID(),
                    }),
                  });
                  const body = (await response.json()) as {
                    readonly attempt_id?: string;
                    readonly title?: string;
                  };
                  if (!response.ok) {
                    setError(body.title ?? "Could not start analysis.");
                    return;
                  }
                  setSuccess(
                    body.attempt_id
                      ? `Attempt ${body.attempt_id.slice(0, 8)} queued.`
                      : "Analysis queued.",
                  );
                  router.refresh();
                })
              }
            >
              Start analysis
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
