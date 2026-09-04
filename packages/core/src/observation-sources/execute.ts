import { readFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import {
  INTERNAL_OBSERVATION_CONTEXT,
  ingestObservationManifest,
  mergeObservationIngestionResults,
  normalizeObservationBatches,
  qualityObservationIdentity,
  type ObservationIngestionResult
} from "../observations";
import { evaluateObservationSourceProfileEnv } from "./env";
import type {
  ExecutedObservationSourceArtifact,
  ExecutedObservationSourceRun,
  HostObservationTransportRegistry,
  ObservationSourceExecutionResult,
  ObservationSourceExecutionSelection,
  ObservationSourceProfile,
  ObservationSourceProfileParseBatch
} from "./types";

interface ExecuteObservationSourceProfileInput {
  readonly profile: ObservationSourceProfile;
  readonly projectRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly selection?: ObservationSourceExecutionSelection;
  readonly fetchImpl?: typeof fetch;
  readonly hostTransports?: HostObservationTransportRegistry;
}

interface DownloadedArtifactEntry {
  readonly path: string;
  readonly text: string;
}

interface DownloadedArtifact {
  readonly name: string;
  readonly updatedAt?: string;
  readonly entries: readonly DownloadedArtifactEntry[];
}

interface GitHubWorkflowRunSummaryResponse {
  readonly id?: number;
  readonly name?: string;
  readonly display_title?: string;
  readonly head_sha?: string;
  readonly head_branch?: string;
  readonly status?: string;
  readonly conclusion?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly html_url?: string;
}

interface GitHubWorkflowRunsResponse {
  readonly workflow_runs?: readonly GitHubWorkflowRunSummaryResponse[];
}

interface GitHubArtifactResponse {
  readonly id?: number;
  readonly name?: string;
  readonly archive_download_url?: string;
  readonly expired?: boolean;
  readonly updated_at?: string;
}

interface GitHubArtifactsResponse {
  readonly artifacts?: readonly GitHubArtifactResponse[];
}

// Counts only diagnostics that describe something going wrong. An `info`
// note — "this report records no commit", say — is context for the reader, not
// a degraded read, and reporting it as `partial` would say a run half-failed
// when every record arrived intact.
function countProblems(diagnostics: readonly ScanDiagnostic[]): number {
  return diagnostics.filter((entry) => entry.severity !== "info").length;
}

function statusFor(observationCount: number, diagnosticsCount: number): ObservationIngestionResult["status"] {
  if (observationCount === 0 && diagnosticsCount > 0) {
    return "invalid";
  }

  return diagnosticsCount > 0 ? "partial" : "valid";
}

function isoTimestamp(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function artifactNameMatchesSelector(name: string, selector: string): boolean {
  if (selector === name) {
    return true;
  }

  if (!selector.includes("*")) {
    return false;
  }

  const pattern = `^${selector.split("*").map(escapeRegExp).join(".*")}$`;
  return new RegExp(pattern).test(name);
}

function artifactNameMatchesAnySelector(name: string, selectors: readonly string[]): boolean {
  return selectors.some((selector) => artifactNameMatchesSelector(name, selector));
}

function finalizeExecution(input: {
  readonly profile: ObservationSourceProfile;
  readonly envStatus: ReturnType<typeof evaluateObservationSourceProfileEnv>;
  readonly ingestionResults?: readonly ObservationIngestionResult[];
  readonly diagnostics?: readonly ScanDiagnostic[];
  readonly artifacts?: readonly ExecutedObservationSourceArtifact[];
  readonly selectedRun?: ExecutedObservationSourceRun;
}): ObservationSourceExecutionResult {
  const merged = mergeObservationIngestionResults(input.ingestionResults ?? []);
  const diagnostics = [...(input.diagnostics ?? []), ...merged.diagnostics];

  return {
    profileId: input.profile.id,
    profileName: input.profile.name,
    transport: input.profile.transport,
    status: statusFor(merged.observations.length, countProblems(diagnostics)),
    envStatus: input.envStatus,
    observations: merged.observations,
    diagnostics,
    artifacts: input.artifacts ?? [],
    selectedRun: input.selectedRun
  };
}

async function executeHostProfile(
  input: ExecuteObservationSourceProfileInput,
  envStatus: ReturnType<typeof evaluateObservationSourceProfileEnv>
): Promise<ObservationSourceExecutionResult> {
  const provider = input.profile.host?.provider;
  if (provider === undefined) {
    return finalizeExecution({
      profile: input.profile,
      envStatus,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_SOURCE",
          message: `Observation source profile ${input.profile.id} uses transport host but declares no host.provider.`
        })
      ]
    });
  }

  const transport = input.hostTransports?.[provider];
  if (transport === undefined) {
    // A repo can legitimately declare a provider this reader cannot serve — the
    // OSS CLI reading a config written for the hosted app, say. Say which
    // providers ARE registered so the reader can tell "wrong host" from "typo".
    const registered = Object.keys(input.hostTransports ?? {});
    return finalizeExecution({
      profile: input.profile,
      envStatus,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_SOURCE",
          message: `Observation source profile ${input.profile.id} needs host provider ${provider}, which this application does not register. Registered providers: ${joinedList(registered)}.`
        })
      ]
    });
  }

  let result: Awaited<ReturnType<typeof transport>>;
  try {
    result = await transport({
      profile: input.profile,
      selection: input.selection,
      projectRoot: input.projectRoot,
      env: input.env
    });
  } catch (error) {
    return finalizeExecution({
      profile: input.profile,
      envStatus,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_SOURCE",
          message: `Observation source profile ${input.profile.id} host provider ${provider} failed: ${error instanceof Error ? error.message : String(error)}`
        })
      ]
    });
  }

  // The host handed us raw records; from here the engine owns everything. It
  // normalizes and diagnoses them exactly as it would a parsed manifest, so a
  // host transport cannot get a record past a check a file-based one must pass.
  const ingestion = normalizeObservationBatches(
    result.batches.map((batch) => ({
      ...batch,
      context: batch.context ?? INTERNAL_OBSERVATION_CONTEXT
    }))
  );

  return finalizeExecution({
    profile: input.profile,
    envStatus,
    ingestionResults: [ingestion],
    diagnostics: result.diagnostics ?? [],
    selectedRun: result.selectedRun
  });
}

function missingEnvDiagnostics(profile: ObservationSourceProfile, env: NodeJS.ProcessEnv): readonly ScanDiagnostic[] {
  const missing = profile.requiredEnv.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.length === 0;
  });

  if (missing.length === 0) {
    return [];
  }

  return [
    createDiagnostic({
      severity: "error",
      code: "MISSING_OBSERVATION_SOURCE_ENV",
      message: `Observation source profile ${profile.id} requires env vars that are not present: ${missing.join(", ")}.`
    })
  ];
}

function profileSource(
  profile: ObservationSourceProfile,
  input: {
    readonly kind: "github-actions" | "local-folder";
    readonly runId?: string;
    readonly runUrl?: string;
  }
): {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly run_id?: string;
  readonly run_url?: string;
} {
  return {
    id: profile.id,
    kind: input.kind,
    label: profile.name,
    run_id: input.runId,
    run_url: input.runUrl
  };
}

function resolveLocalFolderRoot(
  profile: ObservationSourceProfile,
  projectRoot: string | undefined
): string | undefined {
  const folderPath = profile.localFolder?.path;
  if (folderPath === undefined) {
    return undefined;
  }

  if (path.isAbsolute(folderPath)) {
    return folderPath;
  }

  if (projectRoot === undefined) {
    return undefined;
  }

  return path.resolve(projectRoot, folderPath);
}

function joinedList(values: readonly string[]): string {
  return values.length === 0 ? "(none)" : values.join(", ");
}

async function executeLocalFolderProfile(
  input: ExecuteObservationSourceProfileInput,
  envStatus: ReturnType<typeof evaluateObservationSourceProfileEnv>,
  observationPath: string
): Promise<ObservationSourceExecutionResult> {
  const diagnostics: ScanDiagnostic[] = [];
  const ingestionResults: ObservationIngestionResult[] = [];
  const artifacts: ExecutedObservationSourceArtifact[] = [];
  const folderRoot = resolveLocalFolderRoot(input.profile, input.projectRoot);

  if (folderRoot === undefined) {
    return finalizeExecution({
      profile: input.profile,
      envStatus,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_SOURCE",
          message: `Observation source profile ${input.profile.id} requires projectRoot to resolve local-folder path ${input.profile.localFolder?.path ?? "(missing)"}.`
        })
      ]
    });
  }

  const resolvedPath = path.resolve(folderRoot, observationPath);
  let rawText: string;
  try {
    rawText = await readFile(resolvedPath, "utf8");
  } catch (error) {
    diagnostics.push(
      createDiagnostic({
        severity: "warning",
        code: "MISSING_OBSERVATION_ARTIFACT_MATCH",
        message: `Observation source profile ${input.profile.id} could not read canonical observation file ${observationPath} under ${folderRoot}: ${error instanceof Error ? error.message : String(error)}`
      })
    );

    return finalizeExecution({
      profile: input.profile,
      envStatus,
      ingestionResults,
      diagnostics,
      artifacts
    });
  }

  artifacts.push({
    declaredObservationPath: observationPath,
    sourcePath: resolvedPath
  });
  ingestionResults.push(
    ingestObservationManifest({
      report_json: rawText,
      source: profileSource(input.profile, { kind: "local-folder" }),
      artifact: {
        kind: "local-file",
        path: resolvedPath,
        label: input.profile.name
      }
    })
  );

  return finalizeExecution({
    profile: input.profile,
    envStatus,
    ingestionResults,
    diagnostics,
    artifacts
  });
}

function repoParts(repo: string): { owner: string; name: string } | undefined {
  const [owner, name, ...rest] = repo.split("/");
  if (owner === undefined || name === undefined || rest.length > 0 || owner.length === 0 || name.length === 0) {
    return undefined;
  }
  return { owner, name };
}

async function githubJson<T>(url: string, token: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}) for ${url}`);
  }

  return (await response.json()) as T;
}

async function githubBuffer(url: string, token: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub artifact download failed (${response.status} ${response.statusText}) for ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function compareRuns(left: GitHubWorkflowRunSummaryResponse, right: GitHubWorkflowRunSummaryResponse): number {
  const leftTime = Date.parse(left.updated_at ?? left.created_at ?? "");
  const rightTime = Date.parse(right.updated_at ?? right.created_at ?? "");
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return (right.id ?? 0) - (left.id ?? 0);
}

async function selectGitHubRun(
  profile: ObservationSourceProfile,
  selection: ObservationSourceExecutionSelection | undefined,
  fetchImpl: typeof fetch,
  token: string
): Promise<GitHubWorkflowRunSummaryResponse> {
  const github = profile.github;
  if (github === undefined) {
    throw new Error(`Observation source profile ${profile.id} is missing github config.`);
  }

  const repo = repoParts(github.repo);
  if (repo === undefined) {
    throw new Error(`Observation source profile ${profile.id} has invalid repo ${github.repo}.`);
  }

  if (selection?.runId !== undefined) {
    return githubJson<GitHubWorkflowRunSummaryResponse>(
      `https://api.github.com/repos/${repo.owner}/${repo.name}/actions/runs/${selection.runId}`,
      token,
      fetchImpl
    );
  }

  const branch = selection?.branch ?? github.branch;
  const query = new URLSearchParams({
    per_page: "100",
    status: "completed"
  });
  if (branch !== undefined) {
    query.set("branch", branch);
  }

  const runs = await githubJson<GitHubWorkflowRunsResponse>(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/actions/workflows/${encodeURIComponent(github.workflow)}/runs?${query.toString()}`,
    token,
    fetchImpl
  );

  const candidates = (runs.workflow_runs ?? []).filter((run) =>
    selection?.commit === undefined ? true : run.head_sha === selection.commit
  );
  const selected = [...candidates].sort(compareRuns)[0];
  if (selected === undefined) {
    const branchText = branch === undefined ? "" : ` on branch ${branch}`;
    const commitText = selection?.commit === undefined ? "" : ` for commit ${selection.commit}`;
    throw new Error(
      `Observation source profile ${profile.id} could not find a completed run for workflow ${github.workflow}${branchText}${commitText}.`
    );
  }

  return selected;
}

function zipEntries(zipBuffer: Buffer): readonly DownloadedArtifactEntry[] {
  const zip = new AdmZip(zipBuffer);
  return zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      path: normalizePath(entry.entryName),
      text: entry.getData().toString("utf8")
    }));
}

async function downloadGitHubArtifacts(
  profile: ObservationSourceProfile,
  runId: number,
  fetchImpl: typeof fetch,
  token: string
): Promise<readonly DownloadedArtifact[]> {
  const github = profile.github;
  if (github === undefined) {
    throw new Error(`Observation source profile ${profile.id} is missing github config.`);
  }

  const repo = repoParts(github.repo);
  if (repo === undefined) {
    throw new Error(`Observation source profile ${profile.id} has invalid repo ${github.repo}.`);
  }

  const response = await githubJson<GitHubArtifactsResponse>(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/actions/runs/${runId}/artifacts?per_page=100`,
    token,
    fetchImpl
  );

  const artifacts = (response.artifacts ?? []).filter(
    (artifact): artifact is GitHubArtifactResponse & { name: string; archive_download_url: string } =>
      artifact.expired !== true &&
      typeof artifact.name === "string" &&
      typeof artifact.archive_download_url === "string" &&
      artifactNameMatchesAnySelector(artifact.name, github.artifactNames)
  );

  const downloads = await Promise.all(
    artifacts.map(async (artifact) => ({
      name: artifact.name,
      updatedAt: isoTimestamp(artifact.updated_at),
      entries: zipEntries(await githubBuffer(artifact.archive_download_url, token, fetchImpl))
    }))
  );

  return downloads;
}

function matchingDownloadedEntries(
  downloads: readonly DownloadedArtifact[],
  declaredPath: string
): readonly { artifact: DownloadedArtifact; entry: DownloadedArtifactEntry }[] {
  const normalizedDeclaredPath = normalizePath(declaredPath);
  return downloads.flatMap((artifact) =>
    artifact.entries
      .filter((entry) => entry.path === normalizedDeclaredPath || entry.path.endsWith(`/${normalizedDeclaredPath}`))
      .map((entry) => ({ artifact, entry }))
  );
}

// Selectors that produced no canonical file, when others did. Matching "nothing
// at all" is already reported; a PARTIAL run is the dangerous case, because it
// looks like a successful acquisition while every check backed by the missing
// artifact silently reads unobserved.
function unmatchedSelectors(
  matches: readonly { artifact: DownloadedArtifact; entry: DownloadedArtifactEntry }[],
  selectors: readonly string[]
): readonly string[] {
  return selectors.filter(
    (selector) => !matches.some((match) => artifactNameMatchesSelector(match.artifact.name, selector))
  );
}

function ambiguousDownloadedMatchDetails(
  matches: readonly { artifact: DownloadedArtifact; entry: DownloadedArtifactEntry }[],
  selectors: readonly string[]
): readonly string[] {
  const details = new Set<string>();

  selectors.forEach((selector) => {
    const artifactNames = new Set(
      matches
        .filter((match) => artifactNameMatchesSelector(match.artifact.name, selector))
        .map((match) => match.artifact.name)
    );
    if (artifactNames.size > 1) {
      details.add(`selector ${selector} matched artifacts ${[...artifactNames].join(", ")}`);
    }
  });

  const matchesByArtifact = new Map<string, string[]>();
  matches.forEach((match) => {
    const entryPaths = matchesByArtifact.get(match.artifact.name) ?? [];
    entryPaths.push(match.entry.path);
    matchesByArtifact.set(match.artifact.name, entryPaths);
  });
  matchesByArtifact.forEach((entryPaths, artifactName) => {
    if (entryPaths.length > 1) {
      details.add(`artifact ${artifactName} matched paths ${entryPaths.join(", ")}`);
    }
  });

  return [...details];
}

function duplicateObservationIdentityDetails(
  ingestionResults: readonly ObservationIngestionResult[]
): readonly string[] {
  const firstResultByIdentity = new Map<string, number>();
  const duplicateIdentities = new Set<string>();

  ingestionResults.forEach((result, resultIndex) => {
    result.observations.forEach((observation) => {
      const proofPath = observation.testFile ?? observation.testClass;
      if (proofPath === undefined) {
        return;
      }

      // Same identity rule as the canonical manifest, so a cross-artifact
      // warning here means the same thing as a duplicate there.
      const identity = qualityObservationIdentity({
        path: proofPath,
        test_case: observation.testCase
      });
      // The label below is human-facing and deliberately formatted differently
      // from the identity key it reports on ("path :: case" rather than the
      // key's "path::case"). It is built from the same inputs so the two cannot
      // describe different records, but it is not derived from the key: reading
      // a separator back out of a joined string would break on any path or
      // test name containing it.
      const normalizedPath = normalizePath(proofPath);
      const normalizedTestCase = observation.testCase?.trim() ?? "";
      const firstResultIndex = firstResultByIdentity.get(identity);
      if (firstResultIndex !== undefined && firstResultIndex !== resultIndex) {
        duplicateIdentities.add(
          normalizedTestCase.length === 0
            ? normalizedPath
            : `${normalizedPath} :: ${normalizedTestCase}`
        );
      } else if (firstResultIndex === undefined) {
        firstResultByIdentity.set(identity, resultIndex);
      }
    });
  });

  return [...duplicateIdentities];
}

async function executeGitHubActionsProfile(
  input: ExecuteObservationSourceProfileInput,
  envStatus: ReturnType<typeof evaluateObservationSourceProfileEnv>,
  observationPath: string
): Promise<ObservationSourceExecutionResult> {
  const diagnostics: ScanDiagnostic[] = [];
  const artifacts: ExecutedObservationSourceArtifact[] = [];
  const ingestionResults: ObservationIngestionResult[] = [];
  const fetchImpl = input.fetchImpl ?? fetch;
  const tokenName = input.profile.requiredEnv.find((name) => name === "GITHUB_TOKEN") ?? "GITHUB_TOKEN";
  const token = input.env?.[tokenName] ?? process.env[tokenName];

  if (typeof token !== "string" || token.length === 0) {
    return finalizeExecution({
      profile: input.profile,
      envStatus,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: "MISSING_OBSERVATION_SOURCE_ENV",
          message: `Observation source profile ${input.profile.id} requires GITHUB_TOKEN to fetch GitHub Actions results.`
        })
      ]
    });
  }

  try {
    const selectedRun = await selectGitHubRun(input.profile, input.selection, fetchImpl, token);
    const runId = selectedRun.id;
    if (runId === undefined) {
      throw new Error(`Observation source profile ${input.profile.id} selected a run without an id.`);
    }

    const downloads = await downloadGitHubArtifacts(input.profile, runId, fetchImpl, token);
    const matches = matchingDownloadedEntries(downloads, observationPath);
    const ambiguityDetails = ambiguousDownloadedMatchDetails(
      matches,
      input.profile.github?.artifactNames ?? []
    );
    if (matches.length === 0) {
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "MISSING_OBSERVATION_ARTIFACT_MATCH",
          message: [
            `Observation source profile ${input.profile.id} selected GitHub Actions run ${runId} for workflow ${input.profile.github?.workflow ?? "(unknown workflow)"}, but could not find canonical observation path ${observationPath}.`,
            `Configured artifact_names: ${joinedList(input.profile.github?.artifactNames ?? [])}.`,
            `Downloaded matching artifacts: ${joinedList(downloads.map((download) => download.name))}.`,
            `Downloaded artifact entries: ${joinedList(downloads.flatMap((download) => download.entries.map((entry) => `${download.name}/${entry.path}`)))}.`
          ].join(" ")
        })
      );
    } else if (ambiguityDetails.length > 0) {
      diagnostics.push(
        createDiagnostic({
          severity: "warning",
          code: "AMBIGUOUS_OBSERVATION_ARTIFACT_MATCH",
          message: `Observation source profile ${input.profile.id} matched canonical observation path ${observationPath} ambiguously: ${ambiguityDetails.join("; ")}.`
        })
      );
    } else {
      const missingSelectors = unmatchedSelectors(matches, input.profile.github?.artifactNames ?? []);
      if (missingSelectors.length > 0) {
        diagnostics.push(
          createDiagnostic({
            // Deliberately a warning, not an error: the observations that DID
            // arrive are valid and must keep counting. Raising this to an error
            // would discard a whole run's real results because one job failed to
            // publish, trading a silent gap for a total one.
            severity: "warning",
            code: "INCOMPLETE_OBSERVATION_ARTIFACT_MATCH",
            message: [
              `Observation source profile ${input.profile.id} read GitHub Actions run ${runId}, but ${joinedList(missingSelectors)} matched no artifact.`,
              `Every check proven only by the missing artifact will read unobserved for this run.`,
              `Downloaded matching artifacts: ${joinedList(downloads.map((download) => download.name))}.`
            ].join(" ")
          })
        );
      }

      for (const match of matches) {
        artifacts.push({
          declaredObservationPath: observationPath,
          matchedArtifactName: match.artifact.name,
          matchedObservationPath: match.entry.path
        });
        ingestionResults.push(
          ingestObservationManifest({
            report_json: match.entry.text,
            source: profileSource(input.profile, {
              kind: "github-actions",
              runId: String(runId),
              runUrl: selectedRun.html_url
            }),
            ...(selectedRun.head_sha === undefined
              ? {}
              : {
                  revision: {
                    commit: selectedRun.head_sha,
                    ...(selectedRun.head_branch === undefined ? {} : { branch: selectedRun.head_branch })
                  }
                }),
            artifact: {
              kind: "github-actions-artifact",
              path: `${match.artifact.name}/${match.entry.path}`,
              url: selectedRun.html_url,
              label: match.artifact.name
            }
          })
        );
      }
      const duplicateIdentities = duplicateObservationIdentityDetails(ingestionResults);
      if (duplicateIdentities.length > 0) {
        diagnostics.push(
          createDiagnostic({
            severity: "warning",
            code: "AMBIGUOUS_OBSERVATION_ARTIFACT_MATCH",
            message: `Observation source profile ${input.profile.id} matched several artifacts that publish the same observation identities: ${duplicateIdentities.join(", ")}.`
          })
        );
      }
    }

    return finalizeExecution({
      profile: input.profile,
      envStatus,
      ingestionResults,
      diagnostics,
      artifacts,
      selectedRun: {
        runId,
        workflowName: selectedRun.name,
        runUrl: selectedRun.html_url,
        commit: selectedRun.head_sha,
        branch: selectedRun.head_branch,
        observedAt: isoTimestamp(selectedRun.updated_at) ?? isoTimestamp(selectedRun.created_at)
      }
    });
  } catch (error) {
    return finalizeExecution({
      profile: input.profile,
      envStatus,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_SOURCE",
          message: error instanceof Error ? error.message : String(error)
        })
      ]
    });
  }
}

export function findObservationSourceProfile(
  batch: ObservationSourceProfileParseBatch,
  profileId: string
): ObservationSourceProfile | undefined {
  return batch.results.flatMap((result) => result.document?.profiles ?? []).find((profile) => profile.id === profileId);
}

export async function executeObservationSourceProfile(
  input: ExecuteObservationSourceProfileInput
): Promise<ObservationSourceExecutionResult> {
  const env = input.env ?? process.env;
  const envStatus = evaluateObservationSourceProfileEnv(input.profile, env);
  const envDiagnostics = missingEnvDiagnostics(input.profile, env);
  if (envDiagnostics.length > 0) {
    return finalizeExecution({
      profile: input.profile,
      envStatus,
      diagnostics: envDiagnostics
    });
  }

  if (input.profile.transport === "host") {
    return executeHostProfile(input, envStatus);
  }

  if (input.profile.observationPath === undefined) {
    return finalizeExecution({
      profile: input.profile,
      envStatus,
      diagnostics: [
        createDiagnostic({
          severity: "error",
          code: "INVALID_OBSERVATION_SOURCE",
          message: `Observation source profile ${input.profile.id} has no observation_path, which transport ${input.profile.transport} requires.`
        })
      ]
    });
  }

  if (input.profile.transport === "local-folder") {
    return executeLocalFolderProfile(input, envStatus, input.profile.observationPath);
  }

  return executeGitHubActionsProfile(input, envStatus, input.profile.observationPath);
}
