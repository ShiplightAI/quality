"use client";

import { useQcRoute } from "../host";

import Link from "next/link";
import { AlertTriangle, BarChart3, Boxes, CircleGauge, GitBranch, ShieldCheck } from "lucide-react";
import { Alert, Anchor, Box, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import type { SavedQcView } from "@shiplightai/quality-core";
import type { Workspace } from "@shiplightai/quality-core/workspace";
import { GateLink } from "./GateLink";
import { HelpTooltip } from "./HelpTooltip";
import type { ObservationRuntimeExecutionView } from "./ObservationSourcePanel";
import { TopLeverageRecommendations } from "./TopLeverageRecommendations";
import type { GenerateRecommendationsResponse } from "../lib/ranked-recommendations";
import { hasLoadedRuntimeProof } from "../lib/runtime-proof";

interface OwnerDashboardProps {
  readonly recommendationContext?: {
    readonly observationSetId: string;
    readonly observationSetName?: string;
    readonly generatedRecommendations?: GenerateRecommendationsResponse;
    readonly isPanelOpen: boolean;
    readonly loadError?: string;
    onOpenPanel(): void;
  };
  readonly selectedView?: SavedQcView;
  readonly viewNotice?: string;
  readonly workspace: Workspace;
  readonly observationExecution?: ObservationRuntimeExecutionView;
}

function primaryRollup(execution: ObservationRuntimeExecutionView | undefined) {
  if (execution === undefined || execution.rollups.length === 0) {
    return undefined;
  }
  return execution.rollups[0];
}

function Metric({
  icon,
  label,
  value,
  helpText,
  ariaLabel,
  strong,
  testid
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
  readonly helpText: string;
  readonly ariaLabel?: string;
  readonly strong?: boolean;
  readonly testid?: string;
}): React.ReactElement {
  return (
    <Paper p="md" data-testid={testid}>
      <Stack gap={6}>
        {icon}
        <Text fz={strong ? 32 : 24} fw={600} aria-label={ariaLabel} title={ariaLabel}>
          {value}
        </Text>
        <Group gap={4}>
          <Text size="sm" c="dimmed">{label}</Text>
          <HelpTooltip text={helpText} />
        </Group>
      </Stack>
    </Paper>
  );
}

export function OwnerDashboard({
  recommendationContext,
  selectedView,
  viewNotice,
  workspace,
  observationExecution
}: OwnerDashboardProps): React.ReactElement {
  const qcRoute = useQcRoute();
  const summary = workspace.summary;
  const project = workspace.projectSummary;
  const projectEvidence = project?.freshness.projectEvidence;
  const hasLoadedProof = hasLoadedRuntimeProof(observationExecution);
  const runtimeRollup = hasLoadedProof ? primaryRollup(observationExecution) : undefined;
  const featureCount = workspace.targets.filter((target) => target.scope.toLowerCase() !== "project").length;
  const totalCheckCount = projectEvidence?.totalCheckCount;
  const gapValue = totalCheckCount === undefined
    ? String(summary.attentionCounts.atRisk)
    : `${summary.attentionCounts.atRisk} / ${totalCheckCount}`;
  const runtimeCommit = observationExecution?.execution.resolvedCommit;
  const runtimeBasis =
    observationExecution === undefined
      ? "No runtime observations are loaded. Run an observation set to produce the final quality score."
      : !hasLoadedProof
        ? observationExecution.resolution.diagnostics[0]?.message ??
          observationExecution.execution.diagnostics[0]?.message ??
          "The selected runtime execution did not load any usable observations."
      : runtimeRollup !== undefined
        ? `${runtimeRollup.basis}${runtimeCommit === undefined ? "" : ` Commit ${runtimeCommit.slice(0, 12)}.`}`
        : "The selected runtime execution did not produce a review rollup.";

  return (
    <Stack gap="md" aria-label="Overview">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={2}>Quality overview</Title>
          {summary.projectPath === "" ? (
            <Text size="sm" c="dimmed">Scan a local project to build a quality workspace.</Text>
          ) : null}
          <Text size="sm" c="dimmed" data-testid="artifact-count">
            {summary.artifactCount} quality {summary.artifactCount === 1 ? "artifact" : "artifacts"} discovered
          </Text>
          {summary.projectPath === "" ? null : (
            <Box mt={4}>
              <GateLink href={qcRoute("/reviews")}>
                Review everything that needs confirmation
              </GateLink>
            </Box>
          )}
          {selectedView !== undefined ? (
            <Text size="sm" c="dimmed">
              Saved view: <strong>{selectedView.name}</strong>
              {selectedView.description === undefined ? "" : ` · ${selectedView.description}`}
            </Text>
          ) : null}
        </Stack>
        <Anchor component={Link} href={qcRoute("/help/scoring")}>
          How scores work
        </Anchor>
      </Group>

      {workspace.navigation.targetRemovedMessage !== undefined ? (
        <Alert color="yellow">{workspace.navigation.targetRemovedMessage}</Alert>
      ) : null}
      {viewNotice === undefined ? null : <Alert color="yellow">{viewNotice}</Alert>}

      <Metric
        icon={<CircleGauge aria-hidden size={18} />}
        label="Quality score"
        value={runtimeRollup?.qualityScore === undefined ? "n/a" : `${runtimeRollup.qualityScore} / 100`}
        ariaLabel={`Quality score ${runtimeRollup?.qualityScore ?? "unavailable"} out of 100.`}
        helpText="The final observation-backed score for the currently loaded observation context. It remains unavailable until Quality Explorer runs a saved observation set and evaluates those observations against the current structural maps."
        strong
      />

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Metric
          icon={<BarChart3 aria-hidden size={18} />}
          label="Coverage"
          value={projectEvidence?.coverageScore === undefined ? "n/a" : `${projectEvidence.coverageScore} / 100`}
          ariaLabel={`Coverage ${projectEvidence?.coverageScore ?? "unavailable"} out of 100.`}
          helpText="How much of the project's weighted quality checks are backed by mapped structural evidence definitions. This is derived from checked-in maps, not from runtime observations."
        />
        <Metric
          icon={<ShieldCheck aria-hidden size={18} />}
          label="Evidence confidence"
          value={projectEvidence?.evidenceConfidenceScore === undefined ? "n/a" : `${projectEvidence.evidenceConfidenceScore} / 100`}
          ariaLabel={`Evidence confidence ${projectEvidence?.evidenceConfidenceScore ?? "unavailable"} out of 100.`}
          helpText="How trustworthy the proof is, based on evidence strength and completeness behind the checked-in proof graph. This is not the final runtime quality score."
        />
        <Metric
          icon={<ShieldCheck aria-hidden size={18} />}
          label="Structure confidence"
          value={projectEvidence?.structureConfidenceScore === undefined ? "n/a" : `${projectEvidence.structureConfidenceScore} / 100`}
          ariaLabel={`Structure confidence ${projectEvidence?.structureConfidenceScore ?? "unavailable"} out of 100.`}
          helpText="How trustworthy the structure is, based on where each check came from (a spec or a person, vs. generated by the agent, vs. inferred from existing code). A check with no recorded source scores zero and counts here, so recording the source is what raises the score."
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Metric
          testid="index-target-count"
          icon={<Boxes aria-hidden size={18} />}
          label="Features"
          value={String(featureCount)}
          ariaLabel={`${featureCount} feature ${featureCount === 1 ? "spec" : "specs"} discovered in this project. The project spec is shown separately.`}
          helpText="Features are product or spec areas discovered from project structure, quality evidence, or Markdown evidence. The project spec is shown separately from this count."
        />
        <Metric
          icon={<AlertTriangle aria-hidden size={18} />}
          label="Gaps across checks"
          value={gapValue}
          ariaLabel={totalCheckCount === undefined
            ? `${summary.attentionCounts.atRisk} open evidence ${summary.attentionCounts.atRisk === 1 ? "gap" : "gaps"} across the project.`
            : `${summary.attentionCounts.atRisk} open evidence ${summary.attentionCounts.atRisk === 1 ? "gap" : "gaps"} across ${totalCheckCount} quality ${totalCheckCount === 1 ? "check" : "checks"}.`}
          helpText="Gap records identify where quality checks still lack enough proof. One check can have more than one gap, so the gap count and check count measure different things."
        />
        <Metric
          icon={<GitBranch aria-hidden size={18} />}
          label="Release blockers"
          value={String(summary.releaseRiskCounts.blockers)}
          ariaLabel={`${summary.releaseRiskCounts.blockers} release ${summary.releaseRiskCounts.blockers === 1 ? "blocker" : "blockers"} across the project.`}
          helpText="Evidence gaps marked as release blockers by the underlying quality evidence and analytics model."
        />
      </SimpleGrid>

      {project !== undefined ? (
        <Paper p="md" component="section" aria-label="Quality rollup notes">
          <Stack gap="xs">
            <Text size="sm" c="dimmed">{runtimeBasis}</Text>
            <Text size="sm" c="dimmed">
              {projectEvidence?.basis ?? `Structural coverage and confidence for ${project.projectName} are derived from the scanned quality evidence.`}
            </Text>
            {project.freshness.driftWarnings.length > 0 ? (
              <Stack gap={4} aria-label="Project drift and coverage warnings">
                {project.freshness.driftWarnings.slice(0, 4).map((warning) => (
                  <Group key={warning} gap={6} wrap="nowrap">
                    <AlertTriangle aria-hidden size={14} />
                    <Text size="sm">{warning}</Text>
                  </Group>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Paper>
      ) : null}

      {hasLoadedProof ? (
        <TopLeverageRecommendations
          observationSetId={recommendationContext?.observationSetId}
          observationSetName={recommendationContext?.observationSetName}
          generatedRecommendations={recommendationContext?.generatedRecommendations}
          isPanelOpen={recommendationContext?.isPanelOpen ?? false}
          loadError={recommendationContext?.loadError}
          onOpenPanel={recommendationContext?.onOpenPanel ?? (() => undefined)}
          projectPath={workspace.summary.projectPath}
          selectedView={selectedView}
        />
      ) : null}
    </Stack>
  );
}
