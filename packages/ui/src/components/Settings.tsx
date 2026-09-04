"use client";

import { useQcApi } from "../host";

import { Breadcrumb } from "./Breadcrumb";
import { ObservationSourcesView, type ObservationSourceRow } from "./ObservationSourcesView";
import { CopyInstruction } from "./CopyInstruction";
import { removeObservationSetInstruction } from "../lib/instructions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Code, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { ScanResult } from "@shiplightai/quality-core";

type Profile = NonNullable<
  NonNullable<ScanResult["observationSourceProfiles"]["primary"]>["document"]
>["profiles"][number];

interface RouteProblem {
  readonly detail?: string;
}

interface ScanResponse {
  readonly result: ScanResult;
}

// Read-only Observation sources & sets (spec 045). QC authors nothing — the sources and sets live in
// `.quality/config/**` and are edited in the repo. This page displays the current wiring and turns each
// former edit into a copy-to-agent instruction. Mirrors FeaturePage's read-only + CopyInstruction model.
export function Settings({
  projectPath,
  projectKey,
  installedRepos
}: {
  readonly projectPath: string;
  // Stable id of the selected project (`hosted:<id>` / `local:<path>`), null when none is selected.
  // Used as the reload trigger — all hosted projects share an empty projectPath, so it can't be one.
  readonly projectKey: string | null;
  // The org's GitHub-App-installed repos (repoFullName) — drives the per-source coverage badge.
  readonly installedRepos: readonly string[];
}): React.ReactElement {
  const qcApi = useQcApi();
  const [result, setResult] = useState<ScanResult>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  // Set true in the effect body (not just useRef init): StrictMode/remount runs cleanup→setup, else a cleanup-only ref stays false and load() discards its result.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const profiles = useMemo<readonly Profile[]>(
    () => result?.observationSourceProfiles.primary?.document?.profiles ?? [],
    [result]
  );
  const sourceRows = useMemo<readonly ObservationSourceRow[]>(
    () =>
      profiles.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        transport: p.transport,
        observationPath: p.observationPath,
        github:
          p.github === undefined
            ? undefined
            : {
                repo: p.github.repo,
                workflow: p.github.workflow,
                artifactNames: p.github.artifactNames,
                branch: p.github.branch
              },
        localFolder: p.localFolder === undefined ? undefined : { path: p.localFolder.path },
        host: p.host === undefined ? undefined : { provider: p.host.provider, options: p.host.options }
      })),
    [profiles]
  );
  const sets = useMemo(() => result?.observationSets.primary?.document?.observationSets ?? [], [result]);
  const profileName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) map.set(p.id, p.name);
    return map;
  }, [profiles]);

  const load = useCallback(async (): Promise<void> => {
    if (!projectKey) {
      return;
    }
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await fetch(qcApi("/scan"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath, mode: "scan" })
      });
      const payload: unknown = await response.json();
      if (!mounted.current) {
        return;
      }
      if (!response.ok) {
        setError((payload as RouteProblem).detail ?? "The project could not be scanned.");
        return;
      }
      setResult((payload as ScanResponse).result);
    } catch {
      if (mounted.current) {
        setError("The project could not be scanned.");
      }
    } finally {
      if (mounted.current) {
        setIsLoading(false);
      }
    }
  }, [projectPath, projectKey]);

  // Reset the previous source's data the instant the selected project changes, before the async load
  // resolves — otherwise the previous project's sources/sets stay visible until the new scan lands.
  useEffect(() => {
    setResult(undefined);
  }, [projectKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!projectKey) {
    return (
      <Stack gap="sm" maw={520}>
        <Text size="xs" c="dimmed" tt="uppercase">
          Observations
        </Text>
        <Title order={1}>Observation sources &amp; sets</Title>
        <Text>Select a Quality Explorer source above to see its runtime observation wiring.</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" aria-label="Observations">
      <Stack gap={4}>
        <Breadcrumb current="Observations" />
        <Title order={1}>Observation sources &amp; sets</Title>
        <Text size="sm" c="dimmed">
          Runtime observation wiring lives in <Code>.quality/config/**</Code>. This view is read-only — each change is a{" "}
          <strong>Copy instruction</strong> your coding agent applies via a PR.
        </Text>
      </Stack>

      {isLoading ? (
        <Text role="status" c="dimmed">
          Loading observation wiring
        </Text>
      ) : null}
      {error === undefined ? null : <Alert color="red">{error}</Alert>}

      <Paper p="md" component="section" aria-label="Observation sources">
        <Title order={2} size="h3">
          Observation sources
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Each source pulls CI artifacts and parses them into test results, matched against <Code>evidence.path</Code>{" "}
          in the quality maps. GitHub Actions sources authenticate via your connected GitHub App.
        </Text>
        <ObservationSourcesView profiles={sourceRows} installedRepos={installedRepos} />
      </Paper>

      <Paper p="md" component="section" aria-label="Observation sets">
        <Title order={2} size="h3">
          Observation sets
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Named groups of sources whose results are aggregated together.
        </Text>
        <Stack gap="sm">
          {sets.length === 0 ? (
            <Text size="sm" c="dimmed">
              No observation sets yet — group sources with the <Code>/quality improve</Code> skill (see below).
            </Text>
          ) : (
            sets.map((set) => (
              <Group key={set.id} justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={2}>
                  <Group gap="sm" align="center">
                    <Text fw={500}>{set.name}</Text>
                    <Code>{set.id}</Code>
                  </Group>
                  <Group gap={6} wrap="wrap">
                    {set.profiles.length === 0 ? (
                      <Text size="xs" c="dimmed">
                        No sources
                      </Text>
                    ) : (
                      set.profiles.map((ref) => (
                        <Badge key={ref.profileId} size="xs" variant="light" color="gray">
                          {profileName.get(ref.profileId) ?? ref.profileId}
                        </Badge>
                      ))
                    )}
                  </Group>
                </Stack>
                <CopyInstruction
                  instruction={removeObservationSetInstruction({ name: set.name, id: set.id })}
                  label="Copy: remove set"
                  color="red"
                />
              </Group>
            ))
          )}
        </Stack>
        <Paper withBorder p="md" mt="md" component="section" aria-label="Add an observation set">
          <Text size="sm" fw={600} mb={4}>
            Add an observation set
          </Text>
          <Text size="sm" c="dimmed">
            Observation sets are grouped with the Shiplight <Code>quality</Code> skill, not here. In your coding agent,
            run <Code>/quality improve</Code> and describe the sources to review together — it writes{" "}
            <Code>.quality/config/observation-sets.yaml</Code> via a PR.
          </Text>
        </Paper>
      </Paper>
    </Stack>
  );
}
