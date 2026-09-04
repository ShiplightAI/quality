import { createDiagnostic } from "../diagnostics/diagnostic";
import { INTERNAL_OBSERVATION_CONTEXT } from "./types";
import type { ObservationIngestionResult, ObservationRecordInput, ObservationRecordStatus } from "./types";
import { countProblems } from "./ingest-helpers";
import { normalizeObservationBatches } from "./normalize";

export interface GitHubActionsStepInput {
  readonly name?: string;
  readonly number?: number;
  readonly status?: string;
  readonly conclusion?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface GitHubActionsJobInput {
  readonly name?: string;
  readonly status?: string;
  readonly conclusion?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly steps?: readonly GitHubActionsStepInput[];
  readonly url?: string;
}

export interface GitHubActionsRunInput {
  readonly databaseId?: number;
  readonly displayTitle?: string;
  readonly workflowName?: string;
  readonly headSha?: string;
  readonly status?: string;
  readonly conclusion?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly url?: string;
  readonly jobs?: readonly GitHubActionsJobInput[];
}

export interface GitHubActionsObservationTemplate {
  readonly subject_id: string;
  readonly expectation_id?: string;
  readonly evidence_id: string;
  readonly note?: string;
}

export interface GitHubActionsStepMapping {
  readonly workflow_name?: string;
  readonly job_name?: string;
  readonly step_name: string;
  readonly observations: readonly GitHubActionsObservationTemplate[];
}

export interface IngestGitHubActionsRunInput {
  readonly run: GitHubActionsRunInput;
  readonly mappings: readonly GitHubActionsStepMapping[];
}

interface MatchedStep {
  readonly job: GitHubActionsJobInput;
  readonly step: GitHubActionsStepInput;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isoTimestamp(value: unknown): string | undefined {
  const candidate = stringValue(value);
  if (candidate === undefined) {
    return undefined;
  }

  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

function statusFor(
  observationCount: number,
  diagnosticsCount: number
): ObservationIngestionResult["status"] {
  if (observationCount === 0 && diagnosticsCount > 0) {
    return "invalid";
  }

  return diagnosticsCount > 0 ? "partial" : "valid";
}

function labelForRun(run: GitHubActionsRunInput): string {
  return run.workflowName ?? run.displayTitle ?? "GitHub Actions workflow run";
}

function mapConclusionToStatus(value: unknown): ObservationRecordStatus | undefined {
  switch (stringValue(value)?.toLowerCase()) {
    case "success":
      return "pass";
    case "failure":
      return "fail";
    case "cancelled":
    case "timed_out":
    case "action_required":
    case "startup_failure":
    case "stale":
      return "error";
    case "neutral":
    case "skipped":
      return "skipped";
    default:
      return undefined;
  }
}

function defaultObservationId(
  run: GitHubActionsRunInput,
  job: GitHubActionsJobInput,
  step: GitHubActionsStepInput,
  template: GitHubActionsObservationTemplate
): string {
  return [
    "github-actions",
    run.databaseId ?? labelForRun(run),
    job.name ?? "job",
    step.number ?? step.name ?? "step",
    template.subject_id,
    template.evidence_id
  ].join(":");
}

function matchingSteps(
  run: GitHubActionsRunInput,
  mapping: GitHubActionsStepMapping
): readonly MatchedStep[] {
  if (
    mapping.workflow_name !== undefined &&
    mapping.workflow_name !== run.workflowName &&
    mapping.workflow_name !== run.displayTitle
  ) {
    return [];
  }

  const jobs = Array.isArray(run.jobs) ? run.jobs : [];
  const relevantJobs = jobs.filter((job) => mapping.job_name === undefined || job.name === mapping.job_name);
  const matches: MatchedStep[] = [];

  for (const job of relevantJobs) {
    const steps = Array.isArray(job.steps) ? job.steps : [];
    for (const step of steps) {
      if (step.name === mapping.step_name) {
        matches.push({ job, step });
      }
    }
  }

  return matches;
}

function observationRecordsForStep(
  run: GitHubActionsRunInput,
  mapping: GitHubActionsStepMapping,
  matched: MatchedStep
): readonly ObservationRecordInput[] {
  const observedAt =
    isoTimestamp(matched.step.completedAt) ??
    isoTimestamp(matched.job.completedAt) ??
    isoTimestamp(run.updatedAt) ??
    isoTimestamp(run.createdAt);
  const status = mapConclusionToStatus(matched.step.conclusion);

  if (observedAt === undefined || status === undefined) {
    return [];
  }

  return mapping.observations.map((template) => ({
    observation_id: defaultObservationId(run, matched.job, matched.step, template),
    subject_id: template.subject_id,
    expectation_id: template.expectation_id,
    evidence_id: template.evidence_id,
    status,
    observed_at: observedAt,
    revision: {
      commit: stringValue(run.headSha)
    },
    note: template.note,
    artifacts: matched.job.url === undefined
      ? []
      : [{
          kind: "github-actions-job",
          url: matched.job.url,
          label: matched.job.name
        }]
  }));
}

export function ingestGitHubActionsRun(
  input: IngestGitHubActionsRunInput
): ObservationIngestionResult {
  const diagnostics = [];

  if (!Array.isArray(input.run.jobs)) {
    diagnostics.push(
      createDiagnostic({
        severity: "error",
        code: "INVALID_OBSERVATION_SOURCE",
        message: `${labelForRun(input.run)} is missing a jobs array.`
      })
    );

    return {
      status: "invalid",
      observations: [],
      diagnostics
    };
  }

  const observations: ObservationRecordInput[] = [];

  for (const mapping of input.mappings) {
    const matches = matchingSteps(input.run, mapping);
    if (matches.length === 0) {
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "MISSING_OBSERVATION_SOURCE_STEP",
          message: `${labelForRun(input.run)} did not include the mapped step ${mapping.step_name}${mapping.job_name === undefined ? "" : ` in job ${mapping.job_name}`}.`
        })
      );
      continue;
    }

    if (matches.length > 1) {
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "AMBIGUOUS_OBSERVATION_SOURCE_STEP",
          message: `${labelForRun(input.run)} matched step ${mapping.step_name} more than once${mapping.job_name === undefined ? "" : ` in job ${mapping.job_name}`}.`
        })
      );
      continue;
    }

    const matched = matches[0]!;
    const observedAt =
      isoTimestamp(matched.step.completedAt) ??
      isoTimestamp(matched.job.completedAt) ??
      isoTimestamp(input.run.updatedAt) ??
      isoTimestamp(input.run.createdAt);
    const status = mapConclusionToStatus(matched.step.conclusion);

    if (observedAt === undefined || status === undefined) {
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "UNSUPPORTED_OBSERVATION_SOURCE_STATUS",
          message: `${labelForRun(input.run)} step ${mapping.step_name} could not be converted into a canonical observation status/timestamp.`
        })
      );
      continue;
    }

    observations.push(...observationRecordsForStep(input.run, mapping, matched));
  }

  const normalized = normalizeObservationBatches([
    {
      source: {
        id: "github-actions",
        kind: "ci",
        label: labelForRun(input.run),
        run_id: input.run.databaseId === undefined ? undefined : String(input.run.databaseId),
        run_url: stringValue(input.run.url)
      },
      context: INTERNAL_OBSERVATION_CONTEXT,
      revision: {
        commit: stringValue(input.run.headSha)
      },
      observations
    }
  ]);

  const mergedDiagnostics = [...diagnostics, ...normalized.diagnostics];

  return {
    status: statusFor(normalized.observations.length, countProblems(mergedDiagnostics)),
    observations: normalized.observations,
    diagnostics: mergedDiagnostics
  };
}
