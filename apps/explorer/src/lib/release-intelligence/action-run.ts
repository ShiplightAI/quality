import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_PRODUCTION_POLICY,
  DEFAULT_STAGING_POLICY,
  assessBehavior,
  buildReleaseSystemFacts,
  collectWorkflowEvidence,
  evaluateReleasePolicy,
  parseWorkflowReference,
  type BehaviorAssessment,
  type ExpectedBehavior,
  type ReleaseDetailView,
  type ReleaseEnvironment,
  type ReleaseIssueView,
  type ReleaseWorkflowEvidence,
  type RepositoryFacts,
} from "@shiplightai/quality-core/release-intelligence";
import { compileReleaseFactsOp } from "@shiplightai/quality-core/release-intelligence/operations";
import { qualityProjectRoot } from "@/lib/quality-explorer/project-root";

const execFileAsync = promisify(execFile);
const releasePreviewGlobal = globalThis as typeof globalThis & {
  __qualityReleasePreviewCache?: {
    readonly key: string;
    readonly promise: Promise<ReleasePreviewModel>;
  };
};

interface GitHubRun {
  readonly id: number;
  readonly run_attempt: number;
  readonly name: string;
  readonly html_url: string;
  readonly head_sha: string;
  readonly head_branch: string | null;
  readonly conclusion: string | null;
  readonly path: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly repository: { readonly full_name: string };
}

interface GitHubJobsResponse {
  readonly total_count: number;
  readonly jobs: readonly {
    readonly id: number;
    readonly name: string;
    readonly status: string;
    readonly conclusion: string | null;
    readonly html_url: string;
  }[];
}

interface GitHubArtifactsResponse {
  readonly total_count: number;
  readonly artifacts: readonly {
    readonly id: number;
    readonly name: string;
    readonly size_in_bytes: number;
    readonly expired: boolean;
  }[];
}

export interface ReleasePreviewModel
  extends ReleaseDetailView {
  readonly context: {
    readonly workflowName: string;
    readonly workflowUrl: string;
    readonly workflowRunId: string;
    readonly workflowRunAttempt: number;
    readonly headBranch: string | null;
    readonly environment: ReleaseEnvironment;
    readonly components: readonly string[];
    readonly decision: "ALLOW" | "BLOCK";
  };
}

export interface ActionRunReference {
  readonly owner: string;
  readonly repo: string;
  readonly runId: string;
  readonly runAttempt?: number;
}

export async function loadReleasePreview(): Promise<ReleasePreviewModel> {
  const projectPath = qualityProjectRoot();
  const configuredRun = process.env.RELEASE_ACTION_RUN ?? process.env.RELEASE_ACTION_RUN_ID;
  if (!configuredRun) {
    throw new Error(
      "Set RELEASE_ACTION_RUN to a GitHub Actions run URL, or RELEASE_ACTION_RUN_ID to a numeric run ID.",
    );
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Set GITHUB_TOKEN to a token that can read the workflow run.");

  const cacheKey = JSON.stringify([
    projectPath,
    configuredRun,
    createHash("sha256").update(token).digest("hex"),
    process.env.RELEASE_ENVIRONMENT ?? "production",
    process.env.RELEASE_COMPONENTS ?? "",
  ]);
  if (releasePreviewGlobal.__qualityReleasePreviewCache?.key === cacheKey) {
    return releasePreviewGlobal.__qualityReleasePreviewCache.promise;
  }
  const promise = loadReleasePreviewForConfig(projectPath, configuredRun, token);
  releasePreviewGlobal.__qualityReleasePreviewCache = { key: cacheKey, promise };
  try {
    return await promise;
  } catch (error) {
    if (releasePreviewGlobal.__qualityReleasePreviewCache?.promise === promise) {
      releasePreviewGlobal.__qualityReleasePreviewCache = undefined;
    }
    throw error;
  }
}

async function loadReleasePreviewForConfig(
  projectPath: string,
  configuredRun: string,
  token: string,
): Promise<ReleasePreviewModel> {
  const remoteUrl = /^\d+$/u.test(configuredRun)
    ? await gitOutput(projectPath, ["remote", "get-url", "origin"])
    : undefined;
  const reference = resolveActionRunReference(configuredRun, remoteUrl);
  const [run, jobsResponse, artifactsResponse] = await Promise.all([
    githubJson<GitHubRun>(
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repo)}/actions/runs/${reference.runId}`,
      token,
    ),
    githubJson<GitHubJobsResponse>(
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repo)}/actions/runs/${reference.runId}/jobs?filter=all&per_page=100`,
      token,
    ),
    githubJson<GitHubArtifactsResponse>(
      `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repo)}/actions/runs/${reference.runId}/artifacts?per_page=100`,
      token,
    ),
  ]);
  const expectedRepository = `${reference.owner}/${reference.repo}`;
  if (run.repository.full_name.toLowerCase() !== expectedRepository.toLowerCase()) {
    throw new Error("GitHub returned a workflow run for a different repository.");
  }
  if (reference.runAttempt !== undefined && reference.runAttempt !== run.run_attempt) {
    throw new Error(
      `The requested workflow attempt was ${reference.runAttempt}, but GitHub returned attempt ${run.run_attempt}.`,
    );
  }
  if (!/^[0-9a-f]{40}$/iu.test(run.head_sha)) {
    throw new Error("GitHub returned a workflow run without a full commit SHA.");
  }

  const repository = run.repository.full_name;
  const workflow: ReleaseWorkflowEvidence = {
    runId: String(run.id),
    conclusion: run.conclusion,
    jobs: jobsResponse.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      url: job.html_url,
    })),
    artifacts: artifactsResponse.artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      sizeInBytes: artifact.size_in_bytes,
      expired: artifact.expired,
    })),
  };
  const environment = releaseEnvironment(process.env.RELEASE_ENVIRONMENT);
  const components = splitComponents(process.env.RELEASE_COMPONENTS);

  return withCommitCheckout(
    projectPath,
    reference,
    run.head_sha,
    token,
    async (checkoutPath) => {
      const facts = await compileReleaseFactsOp({
        projectPath: checkoutPath,
        repository,
        commitSha: run.head_sha,
        workflowRunId: String(run.id),
        analyzedWorkflowPath: workflowPath(run.path),
        components,
        env: { NODE_ENV: process.env.NODE_ENV, GITHUB_TOKEN: token },
        diagnosticSecrets: [token],
      });
      return buildPreviewModel({
        run,
        workflow,
        facts,
        environment,
        components,
        evidenceTruncated:
          jobsResponse.total_count > jobsResponse.jobs.length ||
          artifactsResponse.total_count > artifactsResponse.artifacts.length,
      });
    },
  );
}

export function resolveActionRunReference(
  value: string,
  remoteUrl?: string,
): ActionRunReference {
  const parsed = parseWorkflowReference(value.trim());
  if (!parsed) throw new Error("Invalid GitHub Actions run reference.");
  if (parsed.owner && parsed.repo) {
    return {
      owner: parsed.owner,
      repo: parsed.repo,
      runId: parsed.runId,
      ...(parsed.runAttempt === undefined ? {} : { runAttempt: parsed.runAttempt }),
    };
  }
  if (!parsed.runId) throw new Error("Invalid GitHub Actions run reference.");
  const repository = remoteUrl ? parseGitHubRemote(remoteUrl.trim()) : null;
  if (!repository) {
    throw new Error(
      "A numeric RELEASE_ACTION_RUN_ID requires QUALITY_PROJECT_ROOT to have a GitHub origin remote.",
    );
  }
  return { ...repository, runId: parsed.runId };
}

export function parseGitHubRemote(
  value: string,
): { readonly owner: string; readonly repo: string } | null {
  const match = /^(?:https:\/\/github\.com\/|git@[^:]+:)([^/]+)\/([^/]+?)(?:\.git)?$/iu.exec(
    value,
  );
  return match ? { owner: match[1]!, repo: match[2]! } : null;
}

function buildPreviewModel(input: {
  readonly run: GitHubRun;
  readonly workflow: ReleaseWorkflowEvidence;
  readonly facts: RepositoryFacts;
  readonly environment: ReleaseEnvironment;
  readonly components: readonly string[];
  readonly evidenceTruncated: boolean;
}): ReleasePreviewModel {
  const collected = collectWorkflowEvidence(input.workflow, input.facts);
  const assessments = assessFacts(input.facts, collected);
  const systemFacts = buildReleaseSystemFacts({
    factIntegrity: input.facts.factIntegrity,
    evidenceTruncated: input.evidenceTruncated,
    integrityDiagnostics: input.facts.integrityDiagnostics,
    features: input.facts.features,
  });
  const decision = evaluateReleasePolicy({
    policy:
      input.environment === "production" ? DEFAULT_PRODUCTION_POLICY : DEFAULT_STAGING_POLICY,
    assessments,
    systemFacts,
    now: new Date(input.run.updated_at),
  });
  const assessmentViews = assessments.map((assessment) => ({
    id: assessment.behaviorId,
    behaviorSnapshotId: assessment.behaviorId,
    status: assessment.status,
    runtimeStatus: assessment.runtimeStatus,
    observedProof: assessment.observedProof,
    missingProof: assessment.missingProof,
    reason: assessment.reason,
  }));
  const systemFactViews = systemFacts.map((fact) => ({
    id: fact.key,
    factKey: fact.key,
    status: fact.status,
    severity: fact.severity,
    summary: fact.summary,
    exceptionEligible: fact.exceptionEligible,
    findings: fact.findings,
  }));
  const issues = previewIssues(input.facts, assessments, systemFacts, decision);

  return {
    repository: input.run.repository.full_name,
    release: {
      id: `preview:${input.run.id}`,
      commitSha: input.run.head_sha,
      workflowName: input.run.name,
      workflowUrl: input.run.html_url,
      workflowRunId: String(input.run.id),
      environment: input.environment,
      components: input.components,
      publishStatus: "unknown",
    },
    context: {
      workflowName: input.run.name,
      workflowUrl: input.run.html_url,
      workflowRunId: String(input.run.id),
      workflowRunAttempt: input.run.run_attempt,
      headBranch: input.run.head_branch,
      environment: input.environment,
      components: input.components,
      decision: decision.decision,
    },
    features: input.facts.features.map((feature) => ({
      id: feature.key,
      featureKey: feature.key,
      name: feature.name,
      description: feature.description,
      priority: feature.priority,
      status: feature.status,
      sourceRefs: feature.sourceRefs,
      diagnostics: feature.diagnostics,
    })),
    behaviors: input.facts.features.flatMap((feature) =>
      feature.behaviors.map((behavior) => ({
        featureId: feature.key,
        behavior: {
          id: behavior.key,
          behaviorKey: behavior.key,
          title: behavior.title,
          description: behavior.description ?? null,
          priority: behavior.priority,
          origin: behavior.origin,
          reviewStatus: behavior.reviewStatus,
          sourceRefs: behavior.sourceRefs,
          requiredProof: behavior.requiredProof,
          applicable: true,
        },
      })),
    ),
    assessments: assessmentViews,
    systemFacts: systemFactViews,
    issues,
    evidence: collected.map((item) => ({
      id: item.key,
      evidenceKey: item.key,
      kind: item.kind,
      sourceName: item.sourceName,
      runtimeStatus: item.runtimeStatus,
      identityStatus: item.identityStatus,
      collectionStatus: item.collectionStatus,
      fileRef: item.fileRef ?? null,
      providerRef: item.providerRef ?? null,
      archiveRef: null,
      contentHash: null,
      details: item.details,
    })),
    assessmentEvidence: collected.flatMap((item) =>
      item.behaviorKeys.map((behaviorKey) => ({
        assessmentId: behaviorKey,
        evidenceRecordId: item.key,
        relationship: item.relationship,
        reason: item.reason,
      })),
    ),
    rules: decision.rules.map((rule) => ({
      id: rule.ruleKey,
      ruleKey: rule.ruleKey,
      status: rule.status,
      inputs: {
        assessmentIds: rule.assessmentIds,
        exceptedAssessmentIds: rule.exceptedAssessmentIds,
        systemFactKeys: rule.systemFactKeys,
      },
      effect: rule.effect,
      reason: rule.reason,
    })),
    exceptions: [],
    attempts: [
      {
        id: `preview:${input.run.id}:${input.run.run_attempt}`,
        attemptNumber: 1,
        triggerType: "workflow_gate",
        status: decision.decision === "ALLOW" ? "allow" : "block",
        analyzerVersion: "local-preview",
        factSetHash: null,
        decision: decision.decision,
        summary: {
          featureCount: input.facts.features.length,
          behaviorCount: assessments.length,
          verifiedCount: assessments.filter((item) => item.status === "verified").length,
          issueCount: issues.length,
        },
        diagnostics: input.facts.diagnostics,
        startedAt: input.run.created_at,
        completedAt: input.run.updated_at,
        createdAt: input.run.created_at,
      },
    ],
  };
}

function assessFacts(
  facts: RepositoryFacts,
  evidence: ReturnType<typeof collectWorkflowEvidence>,
): BehaviorAssessment[] {
  return facts.features.flatMap((feature) =>
    feature.behaviors.map((behavior) => {
      const expected: ExpectedBehavior = {
        id: behavior.key,
        featureId: feature.key,
        title: behavior.title,
        ...(behavior.description ? { description: behavior.description } : {}),
        priority: behavior.priority,
        origin: behavior.origin,
        reviewStatus: behavior.reviewStatus,
        sourceRefs: behavior.sourceRefs,
        requiredProof: behavior.requiredProof,
        applicable: true,
      };
      return assessBehavior(
        expected,
        evidence
          .filter((item) => item.behaviorKeys.includes(behavior.key))
          .map((item) => ({
            id: item.key,
            runtimeStatus: item.runtimeStatus,
            identityStatus: item.identityStatus,
            collectionStatus: item.collectionStatus,
            relationship: item.relationship,
            proves: item.proves,
            reason: item.reason,
          })),
      );
    }),
  );
}

function previewIssues(
  facts: RepositoryFacts,
  assessments: readonly BehaviorAssessment[],
  systemFacts: ReturnType<typeof buildReleaseSystemFacts>,
  decision: ReturnType<typeof evaluateReleasePolicy>,
): ReleaseIssueView[] {
  const titles = new Map(
    facts.features.flatMap((feature) =>
      feature.behaviors.map((behavior) => [behavior.key, behavior.title] as const),
    ),
  );
  const behaviorIssues: ReleaseIssueView[] = assessments
    .filter((item) => !["verified", "not_applicable"].includes(item.status))
    .map((assessment) => ({
      id: `issue:${assessment.behaviorId}`,
      assessmentId: assessment.behaviorId,
      systemFactId: null,
      kind: assessment.status,
      severity: decision.blockingAssessmentIds.includes(assessment.behaviorId)
        ? "critical"
        : "warning",
      title: `${titles.get(assessment.behaviorId) ?? assessment.behaviorId}: ${assessment.status.replaceAll("_", " ")}`,
      reason: assessment.reason,
      recommendedAction:
        assessment.missingProof.length > 0
          ? `Provide exact-run evidence for: ${assessment.missingProof.join(", ")}.`
          : "Inspect the linked evidence and correct the failing or conflicting check.",
      blocksWithoutException: decision.blockingAssessmentIds.includes(assessment.behaviorId),
    }));
  const factIssues: ReleaseIssueView[] = systemFacts
    .filter((fact) => fact.status === "failed")
    .map((fact) => ({
      id: `issue:${fact.key}`,
      assessmentId: null,
      systemFactId: fact.key,
      kind: "analysis_error",
      severity: fact.severity,
      title: `${fact.key.replaceAll("-", " ")}: incomplete`,
      reason: fact.summary,
      recommendedAction:
        fact.findings[0]?.remediation ?? "Resolve the analysis input problem and run it again.",
      blocksWithoutException: fact.severity === "critical",
    }));
  return [...behaviorIssues, ...factIssues];
}

async function withCommitCheckout<T>(
  projectPath: string,
  repository: Pick<ActionRunReference, "owner" | "repo">,
  commitSha: string,
  token: string,
  operation: (checkoutPath: string) => Promise<T>,
): Promise<T> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "quality-release-preview-"));
  const worktreePath = join(temporaryRoot, "checkout");
  try {
    if (await hasCommit(projectPath, commitSha)) {
      await materializeLocalArchive(temporaryRoot, worktreePath, projectPath, commitSha);
    } else {
      await materializeGitHubArchive(temporaryRoot, worktreePath, repository, commitSha, token);
    }
    return await operation(worktreePath);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function materializeLocalArchive(
  temporaryRoot: string,
  checkoutPath: string,
  projectPath: string,
  commitSha: string,
): Promise<void> {
  const archivePath = join(temporaryRoot, "source.tar.gz");
  await mkdir(checkoutPath);
  await execFileAsync("git", [
    "-C",
    projectPath,
    "archive",
    "--format=tar.gz",
    `--output=${archivePath}`,
    commitSha,
  ]);
  await extractArchive(archivePath, checkoutPath);
}

async function hasCommit(projectPath: string, commitSha: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", projectPath, "cat-file", "-e", `${commitSha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function materializeGitHubArchive(
  temporaryRoot: string,
  checkoutPath: string,
  repository: Pick<ActionRunReference, "owner" | "repo">,
  commitSha: string,
  token: string,
): Promise<void> {
  const response = await githubResponse(
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/tarball/${commitSha}`,
    token,
  );
  const archivePath = join(temporaryRoot, "source.tar.gz");
  await Promise.all([
    mkdir(checkoutPath),
    writeFile(archivePath, Buffer.from(await response.arrayBuffer())),
  ]);
  await extractArchive(archivePath, checkoutPath, 1);
}

async function extractArchive(
  archivePath: string,
  checkoutPath: string,
  stripComponents = 0,
): Promise<void> {
  const [{ stdout: entries }, { stdout: verboseEntries }] = await Promise.all([
    execFileAsync("tar", ["-tzf", archivePath]),
    execFileAsync("tar", ["-tvzf", archivePath]),
  ]);
  if (archiveListingHasUnsafePath(entries, verboseEntries)) {
    throw new Error("Refusing to extract an archive with an unsafe path.");
  }

  await execFileAsync("tar", [
    "-xzf",
    archivePath,
    "-C",
    checkoutPath,
    ...(stripComponents > 0 ? [`--strip-components=${stripComponents}`] : []),
  ]);
}

export function archiveListingHasUnsafePath(entries: string, verboseEntries: string): boolean {
  const pathIsUnsafe = (path: string): boolean =>
    path.startsWith("/") || path.split("/").includes("..");
  if (entries.split("\n").filter(Boolean).some(pathIsUnsafe)) return true;

  return verboseEntries
    .split("\n")
    .filter((entry) => entry.startsWith("l"))
    .some((entry) => {
      const separator = entry.lastIndexOf(" -> ");
      return separator >= 0 && pathIsUnsafe(entry.slice(separator + 4));
    });
}

async function gitOutput(projectPath: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", projectPath, ...args]);
  return stdout.trim();
}

async function githubJson<T>(path: string, token: string): Promise<T> {
  const response = await githubResponse(path, token);
  return (await response.json()) as T;
}

async function githubResponse(path: string, token: string): Promise<Response> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned ${response.status}.`);
  }
  return response;
}

function workflowPath(value: string): string {
  return value.split("@", 1)[0] ?? value;
}

function releaseEnvironment(value: string | undefined): ReleaseEnvironment {
  if (value === undefined || value === "production") return "production";
  if (value === "staging") return "staging";
  throw new Error("RELEASE_ENVIRONMENT must be staging or production.");
}

function splitComponents(value: string | undefined): readonly string[] {
  return value
    ? value.split(",").map((component) => component.trim()).filter(Boolean)
    : [];
}
