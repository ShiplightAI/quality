import type { ReleaseSystemFactFinding, SourceReference } from './types';
import type { ReleaseIssueEvidenceView, ReleaseIssueView } from './read-models';
import { parseReleaseSystemFactFindings } from './system-facts';

export interface ReleaseIssueFixPromptInput {
  readonly repository: string;
  readonly commitSha: string;
  readonly issue: {
    readonly kind: string;
    readonly title: string;
    readonly reason: string;
    readonly recommendedAction: string;
  };
  readonly behavior?: {
    readonly featureName: string;
    readonly title: string;
    readonly description?: string;
    readonly sourceRefs: readonly SourceReference[];
    readonly missingProof: readonly string[];
  };
  readonly systemFact?: {
    readonly findings: readonly ReleaseSystemFactFinding[];
  };
}

export function buildReleaseIssueFixPrompt(input: ReleaseIssueFixPromptInput): string {
  const details = input.behavior
    ? behaviorDetails(input.behavior)
    : input.systemFact
      ? systemFactDetails(input.systemFact)
      : [];

  return [
    `${taskForIssue(input.issue.kind)}: ${input.issue.title}`,
    '',
    `Problem: ${input.issue.reason}`,
    ...details,
    ...(!input.systemFact ? [`Fix: ${input.issue.recommendedAction}`] : []),
    `Analyzed at: ${input.repository}@${input.commitSha}`,
    '',
    verificationForIssue(input.issue.kind),
  ].join('\n');
}

/** Builds a fix prompt from the provider-neutral persisted detail projection. */
export function buildReleaseIssueFixPromptForView(
  detail: ReleaseIssueEvidenceView,
  issue: ReleaseIssueView,
): string {
  const assessment = issue.assessmentId
    ? detail.assessments.find((item) => item.id === issue.assessmentId)
    : undefined;
  const behaviorItem = assessment
    ? detail.behaviors.find((item) => item.behavior.id === assessment.behaviorSnapshotId)
    : undefined;
  const feature = behaviorItem
    ? detail.features.find((item) => item.id === behaviorItem.featureId)
    : undefined;
  const systemFact = issue.systemFactId
    ? detail.systemFacts.find((item) => item.id === issue.systemFactId)
    : undefined;

  return buildReleaseIssueFixPrompt({
    repository: detail.repository,
    commitSha: detail.release.commitSha,
    issue,
    ...(assessment && behaviorItem && feature
      ? {
          behavior: {
            featureName: feature.name,
            title: behaviorItem.behavior.title,
            description: behaviorItem.behavior.description ?? undefined,
            sourceRefs: behaviorItem.behavior.sourceRefs,
            missingProof: assessment.missingProof,
          },
        }
      : {}),
    ...(systemFact
      ? { systemFact: { findings: parseReleaseSystemFactFindings(systemFact.findings) } }
      : {}),
  });
}

function taskForIssue(kind: string): string {
  switch (kind) {
    case 'failed':
      return 'Fix the failing product behavior';
    case 'insufficient_proof':
      return 'Add the missing verification evidence';
    case 'conflicting_facts':
      return 'Resolve the conflicting implementation or evidence';
    case 'check_error':
      return 'Repair the verification check';
    case 'analysis_error':
      return 'Repair the release-analysis input';
    default:
      return 'Address this release issue';
  }
}

function verificationForIssue(kind: string): string {
  switch (kind) {
    case 'failed':
      return 'Reproduce the failure, add or update a regression test, make the smallest correct product fix, and run the relevant checks.';
    case 'insufficient_proof':
      return 'Confirm the behavior at HEAD and add focused proof without weakening assertions. Do not change product behavior unless reproduction shows it is wrong.';
    case 'conflicting_facts':
      return 'Determine the intended behavior from repository-owned sources, resolve the conflict without discarding valid evidence, and run the relevant checks.';
    case 'check_error':
      return 'Reproduce the check error, repair the check without weakening its assertions, and run it successfully.';
    case 'analysis_error':
      return 'Validate the referenced paths and declarations at HEAD, make the smallest input correction, and rerun the relevant analysis checks.';
    default:
      return 'Confirm the issue at HEAD, make the smallest correct fix without weakening assertions, and run the relevant checks.';
  }
}

function behaviorDetails(input: NonNullable<ReleaseIssueFixPromptInput['behavior']>): string[] {
  return [
    `Context: ${input.featureName} / ${input.title}`,
    ...(input.description ? [`Expected: ${input.description}`] : []),
    ...list('Files', input.sourceRefs.map(formatSourceReference)),
    ...list('Missing proof', input.missingProof),
  ];
}

function systemFactDetails(input: NonNullable<ReleaseIssueFixPromptInput['systemFact']>): string[] {
  return input.findings.flatMap((finding, index) => [
    `${input.findings.length > 1 ? `Detail ${index + 1}` : 'Detail'}: ${finding.message}`,
    ...(finding.featureName || finding.behaviorTitle
      ? [`Context: ${[finding.featureName, finding.behaviorTitle].filter(Boolean).join(' / ')}`]
      : []),
    ...list(
      'Files',
      [finding.declarationPath, finding.affectedPath].filter(
        (path): path is string => path !== undefined,
      ),
    ),
    `Fix${input.findings.length > 1 ? ` ${index + 1}` : ''}: ${finding.remediation}`,
  ]);
}

function list(label: string, values: readonly string[]): string[] {
  return values.length > 0 ? [`${label}: ${values.join(', ')}`] : [];
}

function formatSourceReference(source: SourceReference): string {
  if (source.startLine === undefined) return source.path;
  return `${source.path}:${source.startLine}${source.endLine ? `-${source.endLine}` : ''}`;
}
