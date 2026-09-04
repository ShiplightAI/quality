"use client";

import { Badge, Card, Code, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { CopyInstruction } from "./CopyInstruction";
import { removeObservationSourceInstruction } from "../lib/instructions";

// A single observation source as this view consumes it (decoupled from the ScanResult-derived type).
export interface ObservationSourceRow {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly transport: "github-actions" | "local-folder" | "host";
  // Absent for a host source, which addresses no file.
  readonly observationPath?: string;
  readonly github?: {
    readonly repo: string;
    readonly workflow: string;
    readonly artifactNames: readonly string[];
    readonly branch?: string;
  };
  readonly localFolder?: { readonly path: string };
  readonly host?: { readonly provider: string; readonly options: Readonly<Record<string, string>> };
}

// Read-only view of the repo's observation sources (spec 045). Authoring moved to the repo — every
// former edit control is a copy-to-agent instruction the viewer pastes into their coding agent, which
// edits `.quality/config/observation-sources.yaml` and opens a PR. Mirrors FeaturePage's checks list.
export function ObservationSourcesView({
  profiles,
  installedRepos
}: {
  readonly profiles: readonly ObservationSourceRow[];
  // The org's GitHub-App-installed repos — a github-actions source authenticates via the App only when
  // its `github.repo` is one of these (the coverage badge). Empty in local mode.
  readonly installedRepos: readonly string[];
}): React.ReactElement {
  return (
    <Stack gap="md">
      {profiles.length === 0 ? (
        <Text size="sm" c="dimmed">
          No observation sources yet — wire one with the <Code>/quality improve</Code> skill (see below).
        </Text>
      ) : (
        profiles.map((profile) => {
          const covered =
            profile.transport !== "github-actions" ||
            (profile.github !== undefined && installedRepos.includes(profile.github.repo));
          return (
            <Card key={profile.id} withBorder padding="md">
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Group gap="sm" wrap="wrap" align="center">
                    <Text fw={500}>{profile.name}</Text>
                    <Code>{profile.id}</Code>
                    <Badge size="sm" variant="light">
                      {profile.transport}
                    </Badge>
                  </Group>
                  <CopyInstruction
                    instruction={removeObservationSourceInstruction({
                      name: profile.name,
                      id: profile.id
                    })}
                    label="Copy: remove source"
                    color="red"
                  />
                </Group>

                {profile.description ? (
                  <Text size="sm" c="dimmed">
                    {profile.description}
                  </Text>
                ) : null}

                {profile.transport === "github-actions" && profile.github !== undefined ? (
                  <Group gap="xs" align="center" wrap="wrap">
                    <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: "break-all" }}>
                      {profile.github.repo} · {profile.github.workflow || "—"}
                      {profile.github.branch ? ` @ ${profile.github.branch}` : ""}
                    </Text>
                    {covered ? (
                      <Badge size="xs" color="green">
                        GitHub App ✓
                      </Badge>
                    ) : (
                      <Tooltip
                        label="This repo is not in your GitHub App installation, so its artifacts can't be read."
                        multiline
                        w={260}
                        withArrow
                      >
                        <Badge size="xs" color="red" style={{ cursor: "help" }}>
                          repo not in installation
                        </Badge>
                      </Tooltip>
                    )}
                  </Group>
                ) : profile.localFolder !== undefined ? (
                  <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: "break-all" }}>
                    folder: {profile.localFolder.path || "—"}
                  </Text>
                ) : profile.host !== undefined ? (
                  <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: "break-all" }}>
                    provider: {profile.host.provider}
                    {Object.entries(profile.host.options)
                      .map(([key, value]) => ` · ${key}=${value}`)
                      .join("")}
                  </Text>
                ) : null}

                {profile.observationPath === undefined ? null : (
                  <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: "break-all" }}>
                    observations: {profile.observationPath}
                  </Text>
                )}
              </Stack>
            </Card>
          );
        })
      )}

      <Paper withBorder p="md" component="section" aria-label="Add an observation source">
        <Text size="sm" fw={600} mb={4}>
          Add an observation source
        </Text>
        <Text size="sm" c="dimmed">
          Observation sources are wired with the Shiplight <Code>quality</Code> skill, not here. In your coding agent,
          run <Code>/quality improve</Code> and describe the CI workflow or artifact folder to observe — it makes the
          workflow publish canonical observations and writes <Code>.quality/config/observation-sources.yaml</Code> via a
          PR. A github-actions source must reference a repo in this org&apos;s GitHub App installation.
        </Text>
      </Paper>
    </Stack>
  );
}
