"use client";

import { Breadcrumb } from "./Breadcrumb";
import { CopyInstruction } from "./CopyInstruction";
import { removeViewInstruction } from "@/lib/quality-explorer/instructions";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Code, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { ScanDiagnostic, ScanResult } from "@shiplightai/quality-core";

interface ScanResponse {
  readonly result: ScanResult;
}

interface RouteProblem {
  readonly detail?: string;
  readonly diagnostics?: readonly ScanDiagnostic[];
}

// Read-only Manage Views (spec 045). Saved views live in `.quality/config/views.yaml` and are edited in
// the repo; this page displays them and turns Add/Remove into copy-to-agent instructions the viewer
// pastes into their coding agent, which makes the edit via a PR. Mirrors FeaturePage's read-only model.
export function ViewsManager({
  projectPath,
  projectKey
}: {
  readonly projectPath: string;
  // Reload trigger + presence check (null = no project); hosted projects share an empty projectPath.
  readonly projectKey: string | null;
}): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScanResult>();
  const [loadDiagnostics, setLoadDiagnostics] = useState<readonly ScanDiagnostic[]>([]);

  useEffect(() => {
    if (!projectKey) {
      return;
    }
    let cancelled = false;
    async function load(): Promise<void> {
      setIsLoading(true);
      setLoadDiagnostics([]);
      try {
        const response = await fetch("/api/quality-explorer/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectPath, mode: "scan" })
        });
        const payload: unknown = await response.json();
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setResult(undefined);
          setLoadDiagnostics((payload as RouteProblem).diagnostics ?? []);
          return;
        }
        const scanResponse = payload as ScanResponse;
        setResult(scanResponse.result);
        setLoadDiagnostics(
          scanResponse.result.diagnostics.filter((diagnostic) => diagnostic.code === "UNKNOWN_SAVED_VIEW_FEATURE")
        );
      } catch {
        if (!cancelled) {
          setResult(undefined);
          setLoadDiagnostics([{ severity: "error", code: "SCAN_FAILED", message: "The project could not be loaded." }]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectPath, projectKey]);

  const views = useMemo(() => result?.views.primary?.document?.views ?? [], [result]);
  const featureName = useMemo(() => {
    const map = new Map<string, string>();
    for (const feature of result?.projectMaps.primary?.map?.features ?? []) map.set(feature.id, feature.name);
    return map;
  }, [result]);

  if (!projectKey) {
    return (
      <Stack gap="sm" maw={520}>
        <Text size="xs" c="dimmed" tt="uppercase">
          Saved QC Views
        </Text>
        <Title order={1}>Manage Views</Title>
        <Text>Select a Quality Explorer source above to see its saved views.</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" aria-label="Manage saved QC views">
      <Stack gap={4}>
        <Breadcrumb current="Views" />
        <Title order={1}>Manage Views</Title>
        <Text size="sm" c="dimmed">
          Saved views live in <Code>.quality/config/views.yaml</Code>. This view is read-only — each change is a{" "}
          <strong>Copy instruction</strong> your coding agent applies via a PR.
        </Text>
      </Stack>

      {isLoading ? (
        <Text role="status" c="dimmed">
          Loading project views
        </Text>
      ) : null}
      {loadDiagnostics.map((diagnostic, index) => (
        <Alert color={diagnostic.severity === "error" ? "red" : "yellow"} key={`${diagnostic.code}:${index}`}>
          {diagnostic.message}
        </Alert>
      ))}

      {views.length === 0 ? (
        <Text c="dimmed">
          No saved QC views yet — add one with the <Code>/quality improve</Code> skill (see below).
        </Text>
      ) : (
        <Stack gap="md">
          {views.map((view) => (
            <Paper withBorder p="md" key={view.id}>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={0}>
                  <Title order={2} size="h3">
                    {view.name}
                  </Title>
                  <Text size="sm" c="dimmed">
                    {view.id}
                  </Text>
                </Stack>
                <CopyInstruction
                  instruction={removeViewInstruction({ name: view.name, id: view.id })}
                  label="Copy: remove view"
                  color="red"
                />
              </Group>

              {view.description ? (
                <Text size="sm" mt="sm">
                  {view.description}
                </Text>
              ) : null}

              <Stack gap="xs" mt="md">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  Included features
                </Text>
                {view.featureIds.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No features included.
                  </Text>
                ) : (
                  <Group gap={6} wrap="wrap">
                    {view.featureIds.map((featureId) => (
                      <Badge key={featureId} size="sm" variant="light" color="gray">
                        {featureName.get(featureId) ?? featureId} <Code>{featureId}</Code>
                      </Badge>
                    ))}
                  </Group>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Paper withBorder p="md" component="section" aria-label="Add a view">
        <Text size="sm" fw={600} mb={4}>
          Add a view
        </Text>
        <Text size="sm" c="dimmed">
          Saved views are authored with the Shiplight <Code>quality</Code> skill, not here. In your coding agent, run{" "}
          <Code>/quality improve</Code> and describe the reusable feature slice you want — it validates the feature ids
          against <Code>.quality/project-map.yaml</Code> and writes <Code>.quality/config/views.yaml</Code> via a PR.
        </Text>
      </Paper>
    </Stack>
  );
}
