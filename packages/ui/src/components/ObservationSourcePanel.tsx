"use client";

import { useQcRoute } from "../host";

import Link from "next/link";
import { Button, Select, TextInput } from "@mantine/core";
import type {
  ObservationSet,
  ObservationSetExecutionResult,
  ObservationContextQualityRollup,
  ObservationResolutionAuditRow,
  ObservationResolutionResult,
  ObservationSourceProfile,
  ObservationSourceProfileEnvStatus,
  ScanDiagnostic,
  TargetEvaluationSnapshot
} from "@shiplightai/quality-core";
import { Activity, CircleCheckBig, Clock3, ExternalLink, Play } from "lucide-react";
import { GateLink } from "./GateLink";
import { ScanDiagnostics } from "./ScanDiagnostics";
import { buildObservationProfilePresentation } from "./observation-profile-presentation";
import { hasLoadedProfileRuntimeProof, hasLoadedRuntimeProof } from "../lib/runtime-proof";

interface ObservationSourceEvaluationGroup {
  readonly targets: readonly TargetEvaluationSnapshot[];
}

function auditSummary(rows: readonly ObservationResolutionAuditRow[]): {
  readonly matched: number;
  readonly ambiguous: number;
  readonly unmatched: number;
} {
  return rows.reduce(
    (summary, row) => ({
      matched: summary.matched + (row.matchStatus === "matched" ? 1 : 0),
      ambiguous: summary.ambiguous + (row.matchStatus === "ambiguous" ? 1 : 0),
      unmatched: summary.unmatched + (row.matchStatus === "unmatched" ? 1 : 0)
    }),
    { matched: 0, ambiguous: 0, unmatched: 0 }
  );
}

export interface ObservationSetExecutionView {
  readonly execution: ObservationSetExecutionResult;
  readonly resolution: {
    readonly status: ObservationResolutionResult["status"];
    readonly auditRows: readonly ObservationResolutionAuditRow[];
    readonly diagnostics: readonly ScanDiagnostic[];
  };
  readonly rollups: readonly ObservationContextQualityRollup[];
  readonly evaluations: readonly ObservationSourceEvaluationGroup[];
}

export type ObservationRuntimeExecutionView = ObservationSetExecutionView;

export interface ObservationSetSelectionState {
  readonly branch: string;
  readonly commit: string;
  readonly profileRunIds: Readonly<Record<string, string>>;
}

interface ObservationSourcePanelProps {
  readonly profiles: readonly ObservationSourceProfile[];
  readonly observationSets: readonly ObservationSet[];
  readonly envStatuses: readonly ObservationSourceProfileEnvStatus[];
  readonly scannedProjectPath?: string;
  readonly selectedObservationSetId?: string;
  readonly observationSetSelection: ObservationSetSelectionState;
  readonly isExecuting: boolean;
  readonly execution?: ObservationRuntimeExecutionView;
  readonly executionDiagnostics: readonly ScanDiagnostic[];
  readonly isAuditOpen: boolean;
  onChangeObservationSet(setId: string): void;
  onChangeObservationSetSelection(next: ObservationSetSelectionState): void;
  onExecute(): void;
  onOpenAudit(): void;
}

interface ObservationSetProfileEntry {
  readonly profileId: string;
  readonly profile?: ObservationSourceProfile;
  readonly envStatus?: ObservationSourceProfileEnvStatus;
}

function executionByProfileId(
  execution: ObservationRuntimeExecutionView | undefined
): ReadonlyMap<string, ObservationSetExecutionResult["profiles"][number]> {
  return new Map(
    (execution?.execution.profiles ?? []).map((profileExecution) => [profileExecution.profileId, profileExecution])
  );
}

function envStatusFor(
  envStatuses: readonly ObservationSourceProfileEnvStatus[],
  profileId: string | undefined
): ObservationSourceProfileEnvStatus | undefined {
  return envStatuses.find((entry) => entry.profileId === profileId);
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function primaryRollup(
  rollups: readonly ObservationContextQualityRollup[]
): ObservationContextQualityRollup | undefined {
  return rollups[0];
}

function selectedBranchLabel(execution: ObservationRuntimeExecutionView | undefined): string {
  if (execution === undefined) {
    return "";
  }

  const profileCount = execution.execution.profiles.length;
  return `${profileCount} run${profileCount === 1 ? "" : "s"}`;
}

function observationSetProfiles(
  observationSet: ObservationSet | undefined,
  profiles: readonly ObservationSourceProfile[],
  envStatuses: readonly ObservationSourceProfileEnvStatus[]
): readonly ObservationSetProfileEntry[] {
  return (observationSet?.profiles ?? []).map((profileRef) => ({
    profileId: profileRef.profileId,
    profile: profiles.find((profile) => profile.id === profileRef.profileId),
    envStatus: envStatusFor(envStatuses, profileRef.profileId)
  }));
}

export function ObservationSourcePanel({
  profiles,
  observationSets,
  envStatuses,
  scannedProjectPath,
  selectedObservationSetId,
  observationSetSelection,
  isExecuting,
  execution,
  executionDiagnostics,
  isAuditOpen,
  onChangeObservationSet,
  onChangeObservationSetSelection,
  onExecute,
  onOpenAudit
}: ObservationSourcePanelProps): React.ReactElement | null {
  const qcRoute = useQcRoute();
  if (scannedProjectPath === undefined) {
    return null;
  }

  if (observationSets.length === 0) {
    return (
      <section className="observation-sources-panel" aria-label="Observation sources">
        <div className="observation-panel-header">
          <div>
            <h3>Runtime observations</h3>
            <p className="observation-panel-subtitle">
              This scan is structural only — Quality Explorer hasn't loaded any test results for this repo yet.
            </p>
            <GateLink href={qcRoute("/settings")}>Manage observation sources</GateLink>
          </div>
        </div>

        <div className="observation-empty-state" role="status" aria-live="polite">
          <h4>No observation set is configured</h4>
          {profiles.length === 0 ? (
            <p>
              Add <code>.quality/config/observation-sources.yaml</code> and{" "}
              <code>.quality/config/observation-sets.yaml</code> at the repo root, then refresh the scan.
            </p>
          ) : (
            <p>
              This repo already defines {profiles.length} saved observation source
              {profiles.length === 1 ? "" : "s"}, but none are grouped into a saved observation set yet. Add{" "}
              <code>.quality/config/observation-sets.yaml</code> at the repo root, then refresh the scan.
            </p>
          )}
          <ol className="observation-empty-steps">
            <li>
              Define one or more named <code>github-actions</code> or <code>local-folder</code> sources in{" "}
              <code>.quality/config/observation-sources.yaml</code>.
            </li>
            <li>
              Make each producer publish one canonical <code>quality-observations.json</code> file.
            </li>
            <li>
              Make sure each observation uses a canonical repo-relative evidence path in its <code>path</code>.
            </li>
            <li>
              Create one or more saved observation sets in <code>.quality/config/observation-sets.yaml</code> that
              reference those source ids.
            </li>
            <li>Refresh the scan, then run the saved observation set from this panel.</li>
          </ol>
          {profiles.length > 0 ? (
            <div className="observation-set-profile-list" aria-label="Discovered observation sources">
              {profiles.map((profile) => (
                <article className="observation-set-profile-item" key={profile.id}>
                  <div className="observation-evaluation-title">
                    <strong>{profile.name}</strong>
                    <span className="observation-state-pill observation-state-pass">{profile.transport}</span>
                  </div>
                  <p>{profile.id}</p>
                </article>
              ))}
            </div>
          ) : null}
          <p className="observation-empty-note">
            A coding agent can generate these files by inspecting the repo workflows, standard test outputs, and quality
            checks.
          </p>
        </div>
      </section>
    );
  }

  const selectedSet = observationSets.find((entry) => entry.id === selectedObservationSetId) ?? observationSets[0];
  const setProfiles = observationSetProfiles(selectedSet, profiles, envStatuses);
  const diagnostics = execution?.resolution.diagnostics ?? executionDiagnostics;
  const result = execution;
  const hasLoadedProof = hasLoadedRuntimeProof(result);
  const rollup = result === undefined || !hasLoadedProof ? undefined : primaryRollup(result.rollups);
  const profileExecutions = executionByProfileId(execution);
  const audit = result?.resolution.auditRows ?? [];
  const auditCounts = auditSummary(audit);

  return (
    <section className="observation-sources-panel" aria-label="Observation sources">
      <div className="observation-panel-header">
        <div>
          <h3>Runtime observations</h3>
          <p className="observation-panel-subtitle">
            Pull the test results from your test run to produce the final quality score.
          </p>
          <GateLink href={qcRoute("/settings")}>Manage observation sources</GateLink>
        </div>
      </div>

      <div className="observation-panel-controls">
        <Select
          className="observation-panel-field"
          label="Observation set"
          data={observationSets.map((observationSet) => ({
            value: observationSet.id,
            label: observationSet.name
          }))}
          value={selectedSet?.id ?? ""}
          onChange={(value) => value !== null && onChangeObservationSet(value)}
          allowDeselect={false}
        />

        <Button disabled={isExecuting} leftSection={<Play aria-hidden size={16} />} onClick={onExecute}>
          {isExecuting ? "Running" : "Run"}
        </Button>
      </div>

      {execution === undefined ? (
        <div className="observation-empty-state" role="status" aria-live="polite">
          <h4>No test results loaded yet</h4>
          <p>
            So far you&apos;re seeing what&apos;s planned, not whether it passes. Run a set to pull in your test results
            and get the final quality score.
          </p>
        </div>
      ) : !hasLoadedProof ? (
        <div className="observation-empty-state" role="status" aria-live="polite">
          <h4>No usable runtime observations were loaded</h4>
          <p>
            The selected observation set couldn't load any test results. Fix the diagnostics below, then run it again.
          </p>
        </div>
      ) : null}

      <div className="observation-profile-card">
        <div className="observation-set-profile-list" aria-label="Included source profiles">
          {setProfiles.map((entry) => {
            const profileExecution = profileExecutions.get(entry.profileId);
            const presentation = buildObservationProfilePresentation({
              transport: entry.profile?.transport,
              hasExecution: hasLoadedProfileRuntimeProof(profileExecution),
              selectedRunId: profileExecution?.execution.selectedRun?.runId,
              selectedRunUrl: profileExecution?.execution.selectedRun?.runUrl
            });

            return (
              <article className="observation-set-profile-item" key={entry.profileId}>
                <div className="observation-evaluation-title">
                  <strong>{entry.profile?.name ?? entry.profileId}</strong>
                  {profileExecution !== undefined ? (
                    <span
                      className={`observation-state-pill observation-state-${
                        profileExecution.execution.status === "valid"
                          ? "pass"
                          : profileExecution.execution.status === "partial"
                            ? "partial"
                            : "fail"
                      }`}
                    >
                      {titleCase(profileExecution.execution.status)}
                    </span>
                  ) : null}
                </div>
                <p>{entry.profile?.transport ?? "unresolved source reference"}</p>
                {presentation.showRunValue ? (
                  <div className="observation-profile-run-value">
                    <span>{presentation.runValueLabel}</span>
                    <strong>{presentation.runValue}</strong>
                  </div>
                ) : null}
                {presentation.showRunLink && profileExecution?.execution.selectedRun?.runUrl !== undefined ? (
                  <Link
                    className="dashboard-link"
                    href={profileExecution.execution.selectedRun.runUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open workflow result
                    <ExternalLink aria-hidden="true" size={14} />
                  </Link>
                ) : null}
                {presentation.showEnvStatus &&
                entry.envStatus !== undefined &&
                entry.envStatus.requiredEnv.length > 0 ? (
                  <div className="observation-env-list" aria-label={`Required env vars for ${entry.profileId}`}>
                    {entry.envStatus.requiredEnv.map((required) => (
                      <span
                        className={`observation-env-pill ${required.present ? "observation-env-pill-ready" : "observation-env-pill-missing"}`}
                        key={`${entry.profileId}:${required.name}`}
                      >
                        {required.name}: {required.present ? "present" : "missing"}
                      </span>
                    ))}
                  </div>
                ) : null}
                {presentation.showRunIdInput && entry.profile?.transport === "github-actions" ? (
                  <TextInput
                    className="observation-panel-field observation-profile-run-field"
                    label="Run id"
                    aria-label={`${entry.profile.name} run id`}
                    inputMode="numeric"
                    placeholder="Latest if empty"
                    value={observationSetSelection.profileRunIds[entry.profileId] ?? ""}
                    onChange={(event) =>
                      onChangeObservationSetSelection({
                        ...observationSetSelection,
                        profileRunIds: {
                          ...observationSetSelection.profileRunIds,
                          [entry.profileId]: event.currentTarget.value
                        }
                      })
                    }
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      {isExecuting ? (
        <div className="loading-state" role="status">
          Running observation set
        </div>
      ) : null}

      {result !== undefined ? (
        <div className="observation-result-grid">
          <div className="observation-result-card">
            <Activity aria-hidden="true" size={16} />
            <strong>{titleCase(result.execution.status)}</strong>
            <span>{result.execution.observations.length} normalized observations</span>
          </div>
          <div className="observation-result-card">
            <CircleCheckBig aria-hidden="true" size={16} />
            <strong>{titleCase(result.resolution.status)}</strong>
            <span>
              {result.evaluations.reduce((count, group) => count + group.targets.length, 0)} evaluated targets
            </span>
          </div>
          <div className="observation-result-card">
            <Clock3 aria-hidden="true" size={16} />
            <strong>{selectedBranchLabel(execution)}</strong>
            <span>Saved source runs</span>
          </div>
        </div>
      ) : null}

      {rollup !== undefined ? (
        <div className="observation-run-note">
          <p>{rollup.basis}</p>
        </div>
      ) : null}

      {result !== undefined && hasLoadedProof ? (
        <div className="observation-run-note">
          <p>
            Runtime observations are loaded. Open a feature in Quality explorer to review per-check observation state
            for the current observation set.
          </p>
        </div>
      ) : null}

      {diagnostics.length > 0 ? <ScanDiagnostics diagnostics={diagnostics} label="Observation diagnostics" /> : null}

      {result !== undefined ? (
        <div className="observation-audit-summary">
          <div>
            <strong>Proof-source join audit</strong>
            <p className="observation-panel-subtitle">
              Each runtime observation is joined onto structured evidence by canonical repo-relative test file path.
            </p>
          </div>
          <div className="observation-audit-summary-meta">
            <span className="count">
              {auditCounts.matched} matched row{auditCounts.matched === 1 ? "" : "s"}
            </span>
            {auditCounts.ambiguous > 0 ? <span className="count">{auditCounts.ambiguous} ambiguous</span> : null}
            {auditCounts.unmatched > 0 ? <span className="count">{auditCounts.unmatched} unmatched</span> : null}
          </div>
          <Button variant="default" size="xs" disabled={audit.length === 0} onClick={onOpenAudit}>
            {isAuditOpen ? "Audit open" : "Open join audit"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
