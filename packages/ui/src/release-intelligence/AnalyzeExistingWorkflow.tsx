"use client";

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useReleaseApi, useReleaseRoute } from "./host";
import type { ReleaseRepositoryOption } from "./RepositoryFilter";

interface WorkflowPreview {
  readonly repository: string;
  readonly workflow_run_id: string;
  readonly workflow_run_attempt: number;
  readonly workflow_name: string;
  readonly workflow_url: string;
  readonly commit_sha: string;
  readonly conclusion: string | null;
  readonly release_records: readonly {
    readonly id: string;
    readonly environment: string;
    readonly publish_status: string;
    readonly components: readonly string[];
  }[];
}

export function AnalyzeExistingWorkflow({
  repos,
}: {
  readonly repos: readonly ReleaseRepositoryOption[];
}): React.ReactElement {
  const api = useReleaseApi();
  const releaseRoute = useReleaseRoute();
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [reference, setReference] = useState("");
  const [repoId, setRepoId] = useState<string | null>(repos.length === 1 ? repos[0]!.id : null);
  const [preview, setPreview] = useState<WorkflowPreview>();
  const [environment, setEnvironment] = useState<"staging" | "production">("production");
  const [components, setComponents] = useState("");
  const [error, setError] = useState<string>();
  const [resolvePending, startResolveTransition] = useTransition();
  const [startPending, startAttemptTransition] = useTransition();
  const [importPending, startImportTransition] = useTransition();
  const anyPending = resolvePending || startPending || importPending;
  const close = (): void => {
    setOpened(false);
    setError(undefined);
    setPreview(undefined);
    setComponents("");
  };
  const navigateToRelease = (releaseId: string): void => {
    close();
    router.push(releaseRoute(`/releases/${releaseId}`));
    router.refresh();
  };

  const resolveWorkflow = (): void => {
    startResolveTransition(async () => {
      setError(undefined);
      setPreview(undefined);
      if (!repoId) {
        setError("Select a connected repository.");
        return;
      }
      const response = await fetch(api("/workflow/resolve"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflow_url_or_id: reference, connected_repo_id: repoId }),
      });
      const body = (await response.json()) as WorkflowPreview & { readonly title?: string };
      if (!response.ok) setError(body.title ?? "Could not resolve workflow.");
      else setPreview(body);
    });
  };
  const startAttempt = (releaseId: string): void => {
    startAttemptTransition(async () => {
      setError(undefined);
      const response = await fetch(api(`/releases/${releaseId}/attempts`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflow_url_or_id: reference,
          idempotency_key: globalThis.crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as { readonly title?: string };
      if (!response.ok) setError(body.title ?? "Could not start analysis.");
      else navigateToRelease(releaseId);
    });
  };
  const importAndAnalyze = (): void => {
    startImportTransition(async () => {
      setError(undefined);
      if (!repoId) {
        setError("Select a connected repository.");
        return;
      }
      const response = await fetch(api("/workflow/import"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflow_url_or_id: reference,
          connected_repo_id: repoId,
          environment,
          components: parseComponents(components),
          idempotency_key: globalThis.crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as {
        readonly release_id?: string;
        readonly title?: string;
      };
      if (!response.ok || !body.release_id) {
        setError(body.title ?? "Could not import and analyze workflow.");
      } else navigateToRelease(body.release_id);
    });
  };

  return (
    <>
      <Button onClick={() => setOpened(true)}>Analyze workflow</Button>
      <Modal
        opened={opened}
        onClose={close}
        title="Analyze a historical release workflow"
        size="lg"
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Select the connected repository and enter a GitHub Actions run URL or ID. The host
            previews its exact commit and existing Release Record before creating an immutable
            attempt.
          </Text>
          <Select
            label="Repository"
            placeholder={repos.length === 0 ? "No connected repositories" : "Select repository"}
            data={repos.map((repo) => ({ value: repo.id, label: repo.name }))}
            value={repoId}
            onChange={(value) => {
              setRepoId(value);
              setPreview(undefined);
              setError(undefined);
            }}
            searchable
            disabled={repos.length === 0}
            nothingFoundMessage="No repositories found"
            required
          />
          <TextInput
            label="GitHub workflow run URL or ID"
            placeholder="https://github.com/org/repo/actions/runs/123"
            value={reference}
            onChange={(event) => {
              setReference(event.currentTarget.value);
              setPreview(undefined);
            }}
          />
          {error && <Alert color="red">{error}</Alert>}
          {preview && (
            <Card withBorder>
              <Group justify="space-between">
                <div>
                  <Text fw={700}>{preview.workflow_name}</Text>
                  <Anchor href={preview.workflow_url} target="_blank" size="sm">
                    {preview.repository} · run {preview.workflow_run_id}/
                    {preview.workflow_run_attempt}
                  </Anchor>
                </div>
                <Badge color={preview.conclusion === "success" ? "green" : "yellow"}>
                  {preview.conclusion ?? "running"}
                </Badge>
              </Group>
              <Text ff="monospace" size="sm" mt="sm">
                {preview.commit_sha}
              </Text>
              <Stack gap="xs" mt="md">
                {preview.release_records.length === 0 ? (
                  <Stack gap="sm">
                    <Alert color="blue">
                      This workflow has no Release Record yet. Importing it preserves the verified
                      workflow and commit while leaving publish status unknown until an explicit
                      result is recorded.
                    </Alert>
                    <div>
                      <Text size="sm" fw={500} mb={6}>
                        Target environment
                      </Text>
                      <SegmentedControl
                        fullWidth
                        value={environment}
                        onChange={(value) => setEnvironment(value as "staging" | "production")}
                        data={[
                          { label: "Production", value: "production" },
                          { label: "Staging", value: "staging" },
                        ]}
                      />
                    </div>
                    <TextInput
                      label="Components"
                      description="Comma-separated Quality Center View IDs. Leave blank to analyze all Features."
                      placeholder="web, api"
                      value={components}
                      onChange={(event) => setComponents(event.currentTarget.value)}
                    />
                    <Button loading={importPending} disabled={anyPending} onClick={importAndAnalyze}>
                      Import and analyze
                    </Button>
                  </Stack>
                ) : (
                  preview.release_records.map((record) => (
                    <Group key={record.id} justify="space-between">
                      <div>
                        <Text fw={600}>{record.environment}</Text>
                        <Text size="xs" c="dimmed">
                          publish {record.publish_status}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Components: {record.components.length ? record.components.join(", ") : "All components"}
                        </Text>
                      </div>
                      <Button
                        size="xs"
                        loading={startPending}
                        disabled={anyPending}
                        onClick={() => startAttempt(record.id)}
                      >
                        Start new attempt
                      </Button>
                    </Group>
                  ))
                )}
              </Stack>
            </Card>
          )}
          {repos.length === 0 && (
            <Alert color="yellow">Connect a GitHub repository before analyzing a workflow.</Alert>
          )}
          <Group justify="flex-end">
            <Button type="button" variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={resolvePending}
              disabled={!reference || !repoId || anyPending}
              onClick={resolveWorkflow}
            >
              Resolve workflow
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function parseComponents(value: string): string[] {
  return [...new Set(value.split(",").map((component) => component.trim()).filter(Boolean))];
}
