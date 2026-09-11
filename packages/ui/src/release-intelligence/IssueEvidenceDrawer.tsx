"use client";

import { Anchor, Badge, Drawer, Group, ScrollArea, Stack, Text, Title } from "@mantine/core";
import {
  buildReleaseIssueFixPromptForView,
  githubSourceUrl,
  type ReleaseIssueEvidenceView,
} from "@shiplightai/quality-core/release-intelligence";
import type { ReactNode } from "react";
import { CopyFixPromptButton } from "./CopyFixPromptButton";
import "./IssueEvidenceDrawer.css";

export function IssueEvidenceDrawer({
  detail,
  issueId = null,
  assessmentId = null,
  onClose,
}: {
  readonly detail: ReleaseIssueEvidenceView;
  readonly issueId?: string | null;
  readonly assessmentId?: string | null;
  readonly onClose: () => void;
}): React.ReactElement {
  const requestedIssue = detail.issues.find((item) => item.id === issueId);
  const assessment = requestedIssue?.assessmentId
    ? detail.assessments.find((item) => item.id === requestedIssue.assessmentId)
    : detail.assessments.find((item) => item.id === assessmentId);
  const issue =
    requestedIssue ??
    (assessment ? detail.issues.find((item) => item.assessmentId === assessment.id) : undefined);
  const fixPrompt = issue ? buildReleaseIssueFixPromptForView(detail, issue) : undefined;
  const behaviorItem = assessment
    ? detail.behaviors.find((item) => item.behavior.id === assessment.behaviorSnapshotId)
    : undefined;
  const feature = behaviorItem
    ? detail.features.find((item) => item.id === behaviorItem.featureId)
    : undefined;
  const evidenceLinks = assessment
    ? detail.assessmentEvidence.filter((item) => item.assessmentId === assessment.id)
    : [];
  const linkedEvidence = evidenceLinks.flatMap((link) => {
    const evidence = detail.evidence.find((item) => item.id === link.evidenceRecordId);
    return evidence ? [{ evidence, link }] : [];
  });
  const appliedRules = assessment
    ? detail.rules.filter((rule) => ruleAssessmentIds(rule.inputs).includes(assessment.id))
    : [];
  const blocksRelease =
    issue?.blocksWithoutException ?? appliedRules.some((rule) => rule.effect === "block");
  const status = assessment?.status ?? issue?.kind ?? "analysis issue";

  return (
    <Drawer
      opened={Boolean(issue || assessment)}
      onClose={onClose}
      position="right"
      size={500}
      title="Analysis evidence"
      scrollAreaComponent={ScrollArea.Autosize}
      padding="lg"
      classNames={{
        header: "ri-drawer-header",
        title: "ri-drawer-title",
        body: "ri-drawer-body",
      }}
    >
      {(issue || assessment) && (
        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            {[feature?.name, behaviorItem?.behavior.title].filter(Boolean).join(" / ") ||
              "Release analysis"}
          </Text>
          <Text
            size="xs"
            fw={600}
            c={status === "verified" ? "green" : blocksRelease ? "red" : "orange"}
            tt="uppercase"
            mt={6}
          >
            {status.replaceAll("_", " ")} ·{" "}
            {status === "verified" ? "verified" : blocksRelease ? "blocks release" : "warning"}
          </Text>
          <Title order={2} size="h3" mt={6} mb={6} maw={420}>
            {issue?.title ?? behaviorItem?.behavior.title ?? "Behavior assessment"}
          </Title>
          <Text size="sm" c="dimmed" lh={1.5}>
            {issue?.reason ?? assessment?.reason}
          </Text>
          {issue && fixPrompt && (
            <Group mt="md">
              <CopyFixPromptButton prompt={fixPrompt} />
            </Group>
          )}

          <EvidenceSection title="Required fact">
            <EvidenceRow>
              {behaviorItem?.behavior.description ||
                behaviorItem?.behavior.title ||
                "This issue is produced by an analysis-level diagnostic."}
            </EvidenceRow>
            {(behaviorItem?.behavior.sourceRefs ?? []).map((source) => (
              <EvidenceRow key={`${source.path}:${source.startLine ?? ""}`}>
                <Anchor
                  href={githubSourceUrl(detail.repository, detail.release.commitSha, source)}
                  target="_blank"
                  size="sm"
                >
                  {source.label ?? source.path} ↗
                </Anchor>
              </EvidenceRow>
            ))}
          </EvidenceSection>

          <EvidenceSection title="Evidence observed">
            {(assessment?.observedProof ?? []).map((proof) => (
              <EvidenceRow key={`observed:${proof}`} tone="positive">✓ {proof}</EvidenceRow>
            ))}
            {(assessment?.missingProof ?? []).map((proof) => (
              <EvidenceRow key={`missing:${proof}`} tone="negative">✕ {proof}</EvidenceRow>
            ))}
            {linkedEvidence.map(({ evidence, link }) => {
              const providerLink = evidenceProviderLink(evidence.providerRef);
              return (
                <EvidenceRow key={evidence.id}>
                  <Stack gap={4}>
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Text size="sm" fw={500}>{evidence.sourceName}</Text>
                      <Text size="xs" c={statusColor(evidence.runtimeStatus)} fw={600}>
                        {evidence.runtimeStatus.toUpperCase()}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed" lh={1.45}>{link.relationship} · {link.reason}</Text>
                    <Text size="xs" c="dimmed">
                      Identity {evidence.identityStatus} · Collection {evidence.collectionStatus}
                    </Text>
                    <Group gap="md">
                      {providerLink && (
                        <Anchor href={providerLink.href} target="_blank" size="xs">
                          {providerLink.label} ↗
                        </Anchor>
                      )}
                      {evidence.fileRef?.path && (
                        <Anchor
                          href={githubSourceUrl(
                            detail.repository,
                            detail.release.commitSha,
                            evidence.fileRef,
                          )}
                          target="_blank"
                          size="xs"
                        >
                          Open file at commit ↗
                        </Anchor>
                      )}
                    </Group>
                  </Stack>
                </EvidenceRow>
              );
            })}
            {!assessment?.observedProof.length &&
              !assessment?.missingProof.length &&
              linkedEvidence.length === 0 && (
                <EvidenceRow tone="negative">
                  No evidence record is linked to this analysis issue.
                </EvidenceRow>
              )}
          </EvidenceSection>

          <EvidenceSection title="Assessment">
            <KeyValueRow
              label="Proof assessment"
              value={assessment?.status.replaceAll("_", " ") ?? "Unavailable"}
            />
            <KeyValueRow
              label="Runtime result"
              value={assessment?.runtimeStatus.replaceAll("_", " ") ?? "Unknown"}
            />
            <KeyValueRow
              label="Policy impact"
              value={status === "verified" ? "No issue" : blocksRelease ? "Blocks release" : "Warning"}
            />
            {behaviorItem && (
              <KeyValueRow
                label="Fact origin"
                value={`${behaviorItem.behavior.origin} · ${behaviorItem.behavior.reviewStatus}`}
              />
            )}
          </EvidenceSection>

          {appliedRules.length > 0 && (
            <EvidenceSection title="Decision impact">
              {appliedRules.map((rule) => (
                <EvidenceRow key={rule.id}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div>
                      <Text size="sm" fw={500}>{rule.ruleKey}</Text>
                      <Text size="xs" c="dimmed" mt={3} lh={1.45}>{rule.reason}</Text>
                    </div>
                    <Badge size="xs" variant="light" color={rule.effect === "block" ? "red" : "yellow"}>
                      {rule.status}
                    </Badge>
                  </Group>
                </EvidenceRow>
              ))}
            </EvidenceSection>
          )}

          {issue && (
            <EvidenceSection title="Recommended action">
              <EvidenceRow>{issue.recommendedAction}</EvidenceRow>
            </EvidenceSection>
          )}
        </Stack>
      )}
    </Drawer>
  );
}

function EvidenceSection({ children, title }: { readonly children: ReactNode; readonly title: string }): React.ReactElement {
  return (
    <Stack gap={0} mt="lg" className="ri-drawer-section">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>{title}</Text>
      {children}
    </Stack>
  );
}

function EvidenceRow({ children, tone }: { readonly children: ReactNode; readonly tone?: "positive" | "negative" }): React.ReactElement {
  return (
    <Text
      component="div"
      className="ri-drawer-row"
      size="sm"
      py="sm"
      c={tone === "positive" ? "green" : tone === "negative" ? "orange" : "var(--mantine-color-text)"}
      lh={1.45}
    >
      {children}
    </Text>
  );
}

function KeyValueRow({ label, value }: { readonly label: string; readonly value: string }): React.ReactElement {
  return (
    <Group justify="space-between" className="ri-drawer-row" align="flex-start" wrap="nowrap" py="sm">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" fw={500} ta="right">{value}</Text>
    </Group>
  );
}

function statusColor(status: string): string {
  return status === "passed"
    ? "green"
    : status === "failed" || status === "errored"
      ? "red"
      : "orange";
}

function evidenceProviderLink(providerRef: string | null): { href: string; label: string } | null {
  if (!providerRef) return null;
  if (/^\/runs\/\d+\?test=\d+$/.test(providerRef)) {
    return { href: providerRef, label: "Open run test" };
  }
  if (/^\/runs\/\d+$/.test(providerRef)) {
    return { href: providerRef, label: "Open test run" };
  }
  try {
    const url = new URL(providerRef);
    return url.protocol === "https:" && url.hostname === "github.com"
      ? { href: url.href, label: "Open evidence" }
      : null;
  } catch {
    return null;
  }
}

function ruleAssessmentIds(inputs: Readonly<Record<string, unknown>>): readonly string[] {
  const value = inputs.assessmentIds;
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}
