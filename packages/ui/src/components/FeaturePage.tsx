"use client";

import { useQcApi, useQcHost, useQcRoute } from "../host";
import { useQcScanCache } from "./scan-cache";
import { evidenceRefHref } from "../lib/evidence-ref";

import { Breadcrumb } from "./Breadcrumb";
import { MarkdownOverlay } from "./MarkdownOverlay";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { Alert, Anchor, Badge, Button, Collapse, Group, Paper, Select, Stack, Text, TextInput, Title, Tooltip, UnstyledButton } from "@mantine/core";
import type { EvaluatedEvidenceObservation, NormalizedEvidenceRef, ScanResult } from "@shiplightai/quality-core";
import { buildProjectIndex } from "@shiplightai/quality-core/project-index";
import { buildGapTriage, type GapRecord } from "@shiplightai/quality-core/gap-triage";
import { canonicalFixPromptForGap } from "../lib/fix-prompt";
import { gapExpectationLocalId, verificationChecks } from "../lib/gap-detail";
import { CopyInstruction } from "./CopyInstruction";
import {
  acceptRiskInstruction,
  addCheckInstruction,
  approveCheckListInstruction,
  removeCheckInstruction,
  setProofPolicyInstruction,
  unacceptRiskInstruction
} from "../lib/instructions";

const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

// Human-readable label + tooltip for each structure_provenance value (the YAML/code
// keeps the machine codes; the reader should never see "inferred_brownfield").
const PROVENANCE: Record<string, { readonly label: string; readonly hint: string }> = {
  spec: { label: "From spec", hint: "Recorded source: the feature's written spec." },
  user_authored: { label: "Human-authored", hint: "Recorded source: written or confirmed by a person." },
  agent_generated: { label: "Agent-drafted", hint: "Recorded source: drafted by the agent, not yet human-confirmed." },
  inferred_brownfield: { label: "Inferred from code", hint: "Recorded source: reverse-engineered from existing code, never verified." },
  unspecified: { label: "Source not set", hint: "No source recorded — this check scores zero for structure confidence until a source is set." }
};

function provenanceMeta(value: string): { readonly label: string; readonly hint: string } {
  return PROVENANCE[value] ?? { label: value, hint: "Unrecognized source." };
}

// Compact one-line label for an evidence row: "type · where" (path, else url,
// else test case, else command), so the reviewer sees what proves each check.
function evidenceLabel(entry: {
  readonly type: string;
  readonly path?: string;
  readonly url?: string;
  readonly testCase?: string;
  readonly command?: string;
}): string {
  const where = entry.path ?? entry.url ?? entry.testCase ?? entry.command;
  return where ? `${entry.type} · ${where}` : entry.type;
}

// A "Copy fix prompt" button for a gap: fetches the canonical fix prompt (the same generator the old
// Explorer's DetailPanel used) and copies it, so a reviewer can hand it to an agent.
function CopyFixPromptButton({
  gap,
  projectPath,
}: {
  readonly gap: GapRecord;
  readonly projectPath: string;
}): React.ReactElement {
  const qcApi = useQcApi();
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const mounted = useRef(true);
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current !== undefined) {
        window.clearTimeout(resetTimer.current); // don't setState on an unmounted button
      }
    };
  }, []);

  function scheduleReset(ms: number): void {
    resetTimer.current = window.setTimeout(() => {
      if (mounted.current) {
        setState("idle");
      }
    }, ms);
  }

  async function copy(): Promise<void> {
    setState("loading");
    try {
      const prompt = await canonicalFixPromptForGap(qcApi, gap, projectPath);
      // navigator.clipboard is undefined in non-secure contexts (plain HTTP, some iframes/test
      // runners); guard rather than let the property access throw into a generic catch.
      if (prompt === undefined || navigator.clipboard === undefined) {
        setState("error");
        scheduleReset(3000); // recover from a transient/unavailable clipboard
        return;
      }
      await navigator.clipboard.writeText(prompt);
      setState("copied");
      scheduleReset(2000);
    } catch (error) {
      console.error(error);
      setState("error");
      scheduleReset(3000); // recover from a transient failure
    }
  }

  return (
    <Button
      size="xs"
      variant="light"
      leftSection={<Copy aria-hidden size={14} />}
      loading={state === "loading"}
      onClick={() => void copy()}
      style={{ alignSelf: "flex-start" }}
    >
      {state === "copied" ? "Copied" : state === "error" ? "Prompt unavailable" : "Copy fix prompt"}
    </Button>
  );
}

// Derived from ScanResult so apps/web needn't depend on @shiplightai/quality-map directly.
type QualityGraph = NonNullable<ScanResult["qualityMaps"]["results"][number]["graph"]>;
type QualityCheck = QualityGraph["expectations"][number];

// A check's proof, assembled from the graph: mapped evidence, the linked gap summary (residual
// risk), and the recommended next step. Empty-string gap/next-step don't count (matches render).
function checkEvidence(graph: QualityGraph, expectation: QualityCheck): QualityGraph["evidence"] {
  return graph.evidence.filter((entry) => expectation.linkedEvidenceIds.includes(entry.normalizedId));
}

function observedStateColor(state: string): string {
  switch (state) {
    case "pass":
      return "green";
    case "fail":
      return "red";
    case "error":
      return "orange";
    case "skipped":
      return "gray";
    default:
      return "gray";
  }
}

// Only Markdown artifacts can be previewed inline (the artifact/markdown endpoint reads text).
function canPreviewMarkdownPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized.endsWith(".md") || normalized.endsWith(".markdown");
}

interface ScanResponse {
  readonly result: ScanResult;
}

interface RouteProblem {
  readonly detail?: string;
}

export function FeaturePage({
  projectPath,
  projectKey,
  featureId
}: {
  readonly projectPath: string;
  // Reload trigger + presence check (null = no project); hosted projects share an empty projectPath.
  readonly projectKey: string | null;
  readonly featureId: string;
}): React.ReactElement {
  const qcApi = useQcApi();
  const qcRoute = useQcRoute();
  const { servesEvidenceFiles = false } = useQcHost();
  const scanCache = useQcScanCache();
  const [result, setResult] = useState<ScanResult>();
  const [isLoading, setIsLoading] = useState(false);
  // Set true in the effect body (not just useRef init): StrictMode/remount runs cleanup→setup, else a cleanup-only ref stays false and the loader discards its result.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [error, setError] = useState<string>();
  // View-only: an optional title a viewer types to build a "Copy add-check instruction".
  // Never saved here — it only parameterizes the copy-to-agent instruction.
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("P1");
  // Single-column expandable list: which checks are expanded (localIds).
  const [expandedChecks, setExpandedChecks] = useState<ReadonlySet<string>>(new Set());

  function toggleCheck(id: string): void {
    setExpandedChecks((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Inline preview of a Markdown artifact (spec/plan/tasks), reusing the shared MarkdownOverlay.
  const [markdownViewer, setMarkdownViewer] = useState<{
    readonly reference: { readonly label: string; readonly path: string };
    readonly content?: string;
    readonly error?: string;
    readonly isLoading: boolean;
    readonly sizeBytes?: number;
  }>();

  async function openArtifact(reference: { readonly label: string; readonly path: string }): Promise<void> {
    if (result === undefined) {
      return;
    }
    setMarkdownViewer({ reference, isLoading: true });
    try {
      const response = await fetch(qcApi("/artifact/markdown"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: result.target.resolvedPath, artifactPath: reference.path })
      });
      const payload: unknown = await response.json();
      if (!mounted.current) {
        return;
      }
      if (!response.ok) {
        setMarkdownViewer({ reference, error: (payload as RouteProblem).detail ?? "The file could not be read.", isLoading: false });
        return;
      }
      const markdown = payload as { readonly content: string; readonly sizeBytes: number };
      setMarkdownViewer({ reference, content: markdown.content, isLoading: false, sizeBytes: markdown.sizeBytes });
    } catch (error) {
      console.error(error);
      if (mounted.current) {
        setMarkdownViewer({ reference, error: "The file could not be read.", isLoading: false });
      }
    }
  }

  const feature = useMemo(
    () => result?.projectMaps.primary?.map?.features.find((candidate) => candidate.id === featureId),
    [result, featureId]
  );
  const qualityMapPath = feature?.artifacts.qualityMapPath;
  const graph = useMemo(
    () =>
      result?.qualityMaps.results.find((candidate) => candidate.source.projectRelativePath === qualityMapPath)?.graph,
    [result, qualityMapPath]
  );
  const expectations = graph?.expectations ?? [];

  // Runtime proof for the observation set the viewer last ran on the scanner
  // page. Inherited rather than re-run: this page has no picker, and running a
  // set can mean a network fetch.
  const runtime = projectKey === null ? undefined : scanCache?.getRuntime(projectKey);
  const observed = useMemo(() => {
    const byEvidenceId = new Map<string, EvaluatedEvidenceObservation>();
    const targetId = graph?.target.normalizedId;
    if (runtime === undefined || targetId === undefined) {
      return { byEvidenceId, coversFeature: false, evaluatedAt: undefined as string | undefined };
    }

    // Whether the run evaluated THIS target at all. A view-scoped run evaluates
    // only the targets inside its view, so an empty map here can mean the run
    // never looked rather than that it looked and found nothing — two states
    // the page must not present the same way.
    let coversFeature = false;
    let evaluatedAt: string | undefined;

    for (const group of runtime.evaluations) {
      for (const target of group.targets) {
        if (target.targetId !== targetId) {
          continue;
        }
        coversFeature = true;
        evaluatedAt = target.evaluatedAt;
        for (const expectation of target.expectations) {
          for (const entry of expectation.evidence) {
            byEvidenceId.set(entry.evidenceId, entry);
          }
        }
      }
    }

    return { byEvidenceId, coversFeature, evaluatedAt };
  }, [graph?.target.normalizedId, runtime]);
  const observedEvidence = observed.byEvidenceId;

  // Gap records per check (spec 045): the classified gaps — category label ("Weak evidence"), the
  // residual-risk text, the recommended next proof, and the fix-prompt lookup — the same model the old
  // Explorer used. Built from the feature's target, keyed by the check's expectation localId.
  // Build the project index once per scan result (heavy: walks the whole result). Feature navigation
  // keeps `result` stable (no refetch), so switching features only re-runs the cheap target-id lookup
  // below, not the full index build.
  const projectIndex = useMemo(
    () => (result === undefined ? undefined : buildProjectIndex({ result })),
    [result]
  );
  const featureTargetId = useMemo(
    () =>
      feature === undefined
        ? undefined
        : projectIndex?.targets.find((row) => row.featureKey === feature.id)?.targetId,
    [projectIndex, feature]
  );
  const gapsByExpectation = useMemo<ReadonlyMap<string, readonly GapRecord[]>>(() => {
    const map = new Map<string, GapRecord[]>();
    if (result === undefined || featureTargetId === undefined) {
      return map;
    }
    for (const record of buildGapTriage({ result, targetId: featureTargetId }).records) {
      const localId = gapExpectationLocalId(record);
      const list = map.get(localId) ?? [];
      list.push(record);
      map.set(localId, list);
    }
    return map;
  }, [result, featureTargetId]);

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
        return; // unmounted or feature/path changed mid-flight
      }
      if (!response.ok) {
        setError((payload as RouteProblem).detail ?? "The project could not be scanned.");
        return;
      }
      setResult((payload as ScanResponse).result);
    } catch (error) {
      console.error(error);
      if (mounted.current) {
        setError("The project could not be scanned.");
      }
    } finally {
      if (mounted.current) {
        setIsLoading(false);
      }
    }
  }, [projectPath, projectKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setExpandedChecks(new Set()); // else a different feature's check with the same localId opens pre-expanded
    setNewTitle("");
    setNewPriority("P1");
  }, [graph]);

  // Human name for the feature, used both for display and to parameterize copy-to-agent
  // instructions (which name the target so the agent can act without more context).
  const featureName = feature?.name ?? featureId;

  // Gate 4: whether a human has approved this check list (map-level review flag).
  const checkListRatified = graph?.checksReviewed === true;

  const visibleCount = expectations.length;
  // Accepted-risk gaps are not open gaps: they don't count toward the feature's gap tally.
  const gapCount = expectations.filter(
    (expectation) => (gapsByExpectation.get(expectation.localId) ?? []).some((gap) => !gap.accepted)
  ).length;
  // Feature-level artifacts for the secondary section (the specs/docs that back this feature).
  const artifactRefs: readonly { readonly label: string; readonly path: string }[] =
    feature === undefined
      ? []
      : [
          ...(feature.artifacts.specPath ? [{ label: "Spec", path: feature.artifacts.specPath }] : []),
          ...(feature.artifacts.planPath ? [{ label: "Plan", path: feature.artifacts.planPath }] : []),
          ...(feature.artifacts.tasksPath ? [{ label: "Tasks", path: feature.artifacts.tasksPath }] : []),
          ...(feature.artifacts.testReportPath ? [{ label: "Test report", path: feature.artifacts.testReportPath }] : []),
          ...feature.artifacts.checklistPaths.map((path) => ({ label: "Checklist", path }))
        ];

  if (!projectKey || featureId.trim().length === 0) {
    return (
      <Stack gap="sm" maw={520}>
        <Text size="xs" c="dimmed" tt="uppercase">Feature</Text>
        <Title order={1}>Feature quality checks</Title>
        <Text>Open a feature from the Project page.</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" aria-label="Feature quality checks">
      <Stack gap={6}>
        <Breadcrumb current={feature?.name ?? "Feature"} />
        <Title order={1}>{feature?.name ?? featureId}</Title>
        {feature?.description ? (
          <Text c="dimmed" size="sm">{feature.description}</Text>
        ) : null}
        <Group gap="md">
          <Text size="sm" c="dimmed">{visibleCount} {visibleCount === 1 ? "check" : "checks"}</Text>
          <Text size="sm" c={gapCount > 0 ? "orange" : "dimmed"}>{gapCount} {gapCount === 1 ? "gap" : "gaps"}</Text>
          <Anchor component={Link} href={qcRoute("/explorer")} size="sm">← All features</Anchor>
        </Group>
      </Stack>

      {graph !== undefined ? (
        <Paper withBorder p="md" component="section" aria-label="Check list review">
          <Group gap="md" align="center" wrap="wrap">
            {checkListRatified ? (
              <Badge size="lg" color="green" leftSection={<CheckCircle2 aria-hidden size={14} />} style={{ flexShrink: 0 }}>
                Check list approved
              </Badge>
            ) : (
              <CopyInstruction
                instruction={approveCheckListInstruction({ feature: featureName })}
                label="Copy: approve check list"
                variant="light"
                size="sm"
              />
            )}
            <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 240 }}>
              Approving records that a human reviewed these checks. Once approved (with the feature confirmed), its
              checks count as fully trusted — raising the feature&apos;s <strong>structure-confidence</strong> score.
              Your agent makes the change via a PR.
            </Text>
          </Group>
        </Paper>
      ) : null}

      {isLoading && result !== undefined ? <Text role="status" c="dimmed">Loading feature</Text> : null}
      {error === undefined ? null : <Alert color="red">{error}</Alert>}

      {artifactRefs.length > 0 ? (
        <Paper withBorder p="md" component="section" aria-label="Feature artifacts">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb="xs">Artifacts</Text>
          <Stack gap={2}>
            {artifactRefs.map((ref) => (
              <Group key={`${ref.label}:${ref.path}`} gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed" w={80} style={{ flexShrink: 0 }}>{ref.label}</Text>
                {canPreviewMarkdownPath(ref.path) ? (
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => void openArtifact(ref)}
                    size="xs"
                    style={{ fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all", textAlign: "left" }}
                  >
                    {ref.path}
                  </Anchor>
                ) : (
                  <Text size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" }}>
                    {ref.path}
                  </Text>
                )}
              </Group>
            ))}
          </Stack>
        </Paper>
      ) : null}

      {result === undefined ? (
        // Initial scan in flight: show a loading state, not the "no checks" empty state (which is
        // only true once the scan has resolved). On a load error the red alert above stands alone.
        error === undefined ? <Text role="status" c="dimmed">Loading feature…</Text> : null
      ) : qualityMapPath === undefined || graph === undefined ? (
        <Alert color="yellow">This feature has no quality checks yet.</Alert>
      ) : (
        <>
        {/* Runtime state on this page is only as good as its attribution: a
            check reading "pass" means nothing unless a reviewer can see which
            run said so. With nothing loaded the page stays structural rather
            than painting every check `unobserved`, which reads like a failure
            when it is only a question nobody has asked yet. */}
        <Text size="xs" c="dimmed" mb={6}>
          {runtime === undefined
            ? "No test results loaded. Run an observation set on the dashboard to see runtime proof here."
            : observed.coversFeature
              ? `Runtime proof from observation set: ${runtime.observationSetName}${
                  observed.evaluatedAt === undefined ? "" : ` · evaluated ${observed.evaluatedAt}`
                }`
              : `Observation set ${runtime.observationSetName} did not cover this feature${
                  runtime.viewId === undefined ? "" : ` — it ran scoped to the saved view ${runtime.viewId}`
                }.`}
        </Text>
        <Paper withBorder radius="md" className="feature-check-list" component="section" aria-label="Checks">
          {expectations.length === 0 ? (
            <Text size="sm" c="dimmed" p="md">No quality checks yet. Copy the add-check instruction below to have your agent add one.</Text>
          ) : (
            <div className="feature-check-row feature-check-head">
              <span />
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">Check</Text>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" ta="right">Priority</Text>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" ta="right">Source</Text>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" ta="right">Gap</Text>
            </div>
          )}
          {expectations.map((expectation) => {
            const open = expandedChecks.has(expectation.localId);
            const requireGate = expectation.policyOverride?.requireGate ?? false;
            const provenance = provenanceMeta(expectation.structureProvenance);
            const evidence = checkEvidence(graph, expectation);
            const checkGaps = gapsByExpectation.get(expectation.localId) ?? [];
            // Accepted-risk gaps stay visible (as accepted) but no longer flag the check as
            // having an open gap.
            const hasGap = checkGaps.some((gap) => !gap.accepted);
            return (
              <div key={expectation.localId} className="feature-check-rowwrap">
                <UnstyledButton
                  className="feature-check-row"
                  onClick={() => toggleCheck(expectation.localId)}
                  aria-expanded={open}
                >
                  <ChevronRight
                    size={16}
                    aria-hidden
                    style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }}
                  />
                  <Text fw={500} truncate style={{ minWidth: 0 }}>
                    {expectation.title}
                  </Text>
                  <div style={{ textAlign: "right" }}>
                    <Badge size="sm" variant="light">{expectation.priority ?? "—"}</Badge>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 0 }}>
                    <Tooltip label={provenance.hint} multiline w={240} withArrow position="top-end">
                      <Badge size="sm" color="gray" variant="light" style={{ cursor: "help", maxWidth: "100%" }}>{provenance.label}</Badge>
                    </Tooltip>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {hasGap ? <Badge size="xs" color="orange" variant="light">gap</Badge> : <Text size="xs" c="dimmed">—</Text>}
                  </div>
                </UnstyledButton>
                <Collapse expanded={open}>
                  <Stack gap="md" className="feature-check-detail">
                    {expectation.description ? (
                      <Text size="sm" c="dimmed">{expectation.description}</Text>
                    ) : null}

                    <Stack gap={6}>
                      <Group gap={6}>
                        <Text size="xs" fw={600} tt="uppercase" c="dimmed">Proof{evidence.length > 0 ? ` (${evidence.length})` : ""}</Text>
                        {hasGap ? <Badge size="xs" color="orange" variant="light">gap</Badge> : null}
                      </Group>
                      {evidence.length === 0 && checkGaps.length === 0 ? (
                        <Text size="sm" c="dimmed">No proof mapped.</Text>
                      ) : (
                        <Stack gap="sm">
                          {evidence.length > 0 ? (
                            <Stack gap={6}>
                              {evidence.map((entry) => {
                                const observed = observedEvidence.get(entry.normalizedId);
                                return (
                                  <Stack key={entry.normalizedId} gap={2}>
                                    <Group gap={6} wrap="nowrap" align="baseline">
                                      <Text size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" }}>
                                        {evidenceLabel(entry)}
                                      </Text>
                                      {observed === undefined ? null : (
                                        <Badge size="xs" variant="light" color={observedStateColor(observed.state)}>
                                          {observed.state}
                                        </Badge>
                                      )}
                                    </Group>
                                    {observed?.evidenceRefs.map((ref: NormalizedEvidenceRef, refIndex: number) => {
                                      const href = evidenceRefHref(ref.ref, qcApi, servesEvidenceFiles);
                                      return href === undefined ? (
                                        <Text key={`${refIndex}:${ref.ref}`} size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" }}>
                                          {ref.label ?? "Run evidence"}: {ref.ref}
                                        </Text>
                                      ) : (
                                        <Anchor key={`${refIndex}:${ref.ref}`} href={href} target="_blank" rel="noopener noreferrer" size="xs">
                                          {ref.label ?? "Run evidence"} <ExternalLink aria-hidden size={12} />
                                        </Anchor>
                                      );
                                    })}
                                  </Stack>
                                );
                              })}
                            </Stack>
                          ) : null}
                          {checkGaps.map((gap) => {
                            const checks = verificationChecks(gap);
                            const accepted = gap.accepted;
                            return (
                            <Stack
                              key={gap.gapId}
                              gap={4}
                              p="xs"
                              style={{
                                borderLeft: `3px solid var(--mantine-color-${accepted ? "gray" : "orange"}-5)`,
                                borderRadius: "var(--mantine-radius-sm)",
                                background: `var(--mantine-color-${accepted ? "gray" : "orange"}-light)`
                              }}
                            >
                              <Group gap={6} justify="space-between" wrap="nowrap">
                                <Badge size="xs" color={accepted ? "gray" : "orange"} variant="light">
                                  {gap.categoryLabel}
                                </Badge>
                                {accepted ? (
                                  <Badge size="xs" color="gray" variant="outline">Accepted risk</Badge>
                                ) : null}
                              </Group>
                              <Text size="sm" c={accepted ? "dimmed" : undefined}>{gap.residualRisk}</Text>
                              {!accepted && gap.nextProof.text.trim().length > 0 ? (
                                <Text size="xs" c="dimmed">Recommended action: {gap.nextProof.text}</Text>
                              ) : null}
                              {!accepted && checks.length > 0 ? (
                                <Stack gap={2}>
                                  <Text size="xs" fw={600} c="dimmed">Verification checks</Text>
                                  {checks.map((check) => (
                                    <Text key={check} size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" }}>
                                      {check}
                                    </Text>
                                  ))}
                                </Stack>
                              ) : null}
                              <Group gap="xs">
                                {accepted ? (
                                  <CopyInstruction
                                    instruction={unacceptRiskInstruction({ feature: featureName, checkTitle: expectation.title, checkId: expectation.localId, category: gap.category })}
                                    label="Copy: un-accept"
                                  />
                                ) : (
                                  <>
                                    <CopyFixPromptButton gap={gap} projectPath={projectPath} />
                                    <CopyInstruction
                                      instruction={acceptRiskInstruction({ feature: featureName, checkTitle: expectation.title, checkId: expectation.localId, category: gap.category })}
                                      label="Copy: accept risk"
                                    />
                                  </>
                                )}
                              </Group>
                            </Stack>
                            );
                          })}
                        </Stack>
                      )}
                    </Stack>

                    <Stack gap={8}>
                      <Text size="xs" fw={600} tt="uppercase" c="dimmed">Proof rules</Text>
                      <Group gap="xs" align="center">
                        <Badge size="sm" color={requireGate ? "blue" : "gray"} variant="light">
                          {requireGate ? "Catch regressions in CI: on" : "Catch regressions in CI: off"}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {requireGate
                            ? "Proof must run in CI / a release gate."
                            : "Proof may run anywhere (a break can ship unnoticed)."}
                        </Text>
                      </Group>
                      <Group gap="xs">
                        <CopyInstruction
                          instruction={setProofPolicyInstruction({ feature: featureName, checkTitle: expectation.title, checkId: expectation.localId, requireGate: !requireGate })}
                          label={requireGate ? "Copy: turn off CI-gating" : "Copy: require CI-gating"}
                        />
                        <CopyInstruction
                          instruction={removeCheckInstruction({ feature: featureName, checkTitle: expectation.title, checkId: expectation.localId })}
                          label="Copy: remove check"
                          color="red"
                        />
                      </Group>
                    </Stack>
                  </Stack>
                </Collapse>
              </div>
            );
          })}
          <div className="feature-check-add">
            <Group wrap="nowrap" align="flex-end" gap="xs">
              <TextInput
                flex={1}
                size="xs"
                aria-label="Describe a check to add"
                placeholder="Describe a check the agent missed…"
                value={newTitle}
                onChange={(event) => setNewTitle(event.currentTarget.value)}
              />
              <Select
                aria-label="New quality check priority"
                size="xs"
                data={[...PRIORITIES]}
                value={newPriority}
                onChange={(value) => value && setNewPriority(value)}
                allowDeselect={false}
                w={72}
              />
              <CopyInstruction
                instruction={addCheckInstruction({ feature: featureName, title: newTitle.trim() || "<describe the check>", priority: newPriority })}
                label="Copy: add check"
                variant="default"
                size="sm"
              />
            </Group>
          </div>
        </Paper>
        </>
      )}

      <Text size="xs" c="dimmed">
        This view is read-only. Every change here is a <strong>Copy instruction</strong> — paste it into your coding
        agent and it makes the edit in <code>.quality/**</code> via a PR. <strong>Catch regressions in CI</strong> requires
        a check&apos;s proof to run in CI / a release gate; <strong>Accept risk</strong> records a gap as reviewed,
        tolerated risk so it stops counting as an open gap.
      </Text>

      {markdownViewer !== undefined ? (
        <MarkdownOverlay
          artifactPath={markdownViewer.reference.path}
          content={markdownViewer.content}
          error={markdownViewer.error}
          isLoading={markdownViewer.isLoading}
          sizeBytes={markdownViewer.sizeBytes}
          title={markdownViewer.reference.label}
          onClose={() => setMarkdownViewer(undefined)}
        />
      ) : null}
    </Stack>
  );
}
