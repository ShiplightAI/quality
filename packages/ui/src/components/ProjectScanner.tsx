"use client";

import Link from "next/link";
import { Anchor, Button, Group, Paper, Select, Stack, Text, TextInput, Title, VisuallyHidden } from "@mantine/core";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  ObservationSet,
  ObservationSourceProfile,
  ObservationSourceProfileEnvStatus,
  SavedQcView,
  ScanDiagnostic,
  ScanMode,
  ScanResult
} from "@shiplightai/quality-core";
import {
  applySavedQcView,
  findSavedQcView,
  resolveSavedQcViews
} from "@shiplightai/quality-core/views";
import {
  buildProjectIndex,
  detectSourceClassificationChanges
} from "@shiplightai/quality-core/project-index";
import {
  buildWorkspace,
  type WorkspaceDetailKind,
  type WorkspaceNavigationState,
  type WorkspaceSectionId
} from "@shiplightai/quality-core/workspace";
import { ObservationAuditPanel } from "./ObservationAuditPanel";
import { RecommendationsPanel } from "./RecommendationsPanel";
import {
  ObservationSourcePanel,
  type ObservationSetExecutionView,
  type ObservationSetSelectionState,
  type ObservationRuntimeExecutionView
} from "./ObservationSourcePanel";
import { OwnerDashboard } from "./OwnerDashboard";
import { SetupProgress } from "./SetupProgress";
import { ScanDiagnostics } from "./ScanDiagnostics";
import { FeatureIndex } from "./FeatureIndex";
import { useQcScanCache } from "./scan-cache";
import { serializeObservationSetSelection } from "../lib/observation-set-selection";
import { filterRuntimeExecutionForResult } from "../lib/filter-runtime-execution";
import type { GenerateRecommendationsResponse } from "../lib/ranked-recommendations";
import { useQcApi, useQcHost, useQcRoute, type ScannerProject } from "../host";

interface ScanResponse {
  readonly result: ScanResult;
  readonly observationSourceEnv: readonly ObservationSourceProfileEnvStatus[];
}

interface ScanProblem {
  // Optional: not every error body carries diagnostics. The shared auth guard's 401
  // (`{ type, title, status, trace_id }`) has none, so this must be read defensively —
  // an unguarded `diagnostics[0]` there throws and degrades to a misleading generic error.
  readonly diagnostics?: readonly ScanDiagnostic[];
}

interface ObservationSetExecutionResponse {
  readonly result: ObservationSetExecutionView;
}

interface GenerateRecommendationsProblem {
  readonly detail?: string;
  readonly title?: string;
}

const urlSectionIds: readonly WorkspaceSectionId[] = [
  "overview",
  "evidence",
  "gaps",
  "analytics",
  "artifacts"
];

const urlDetailKinds: readonly WorkspaceDetailKind[] = [
  "target",
  "expectation",
  "evidence",
  "gap",
  "diagnostic",
  "metric",
  "artifact"
];

function fallbackDiagnostic(message: string): ScanDiagnostic {
  return {
    severity: "error",
    code: "FAILED_REFRESH",
    message
  };
}

function sectionFromUrl(value: string | null): WorkspaceSectionId | undefined {
  return urlSectionIds.includes(value as WorkspaceSectionId)
    ? value as WorkspaceSectionId
    : undefined;
}

function detailKindFromUrl(value: string | null): WorkspaceDetailKind | undefined {
  return urlDetailKinds.includes(value as WorkspaceDetailKind)
    ? value as WorkspaceDetailKind
    : undefined;
}

function navigationFromUrl(params: URLSearchParams): Partial<WorkspaceNavigationState> {
  const selectedSection = sectionFromUrl(params.get("section")) ?? "overview";
  const selectedTargetId = params.get("feature") ?? undefined;
  const selectedDetailKind = detailKindFromUrl(params.get("detailKind"));
  const selectedDetailId = params.get("detailId") ?? undefined;

  return {
    selectedSection,
    ...(selectedTargetId === undefined ? {} : { selectedTargetId }),
    ...(selectedDetailKind === undefined ? {} : { selectedDetailKind }),
    ...(selectedDetailId === undefined ? {} : { selectedDetailId })
  };
}

export type ProjectView = "dashboard" | "reviews" | "explorer";

export function ProjectScanner({
  view = "dashboard",
  project = { kind: "none" },
  localAllowed = false,
}: {
  readonly view?: ProjectView;
  readonly project?: ScannerProject;
  // True only in a non-prod, non-hosted (local/dev) deployment (`localProjectsAllowed()`). Keeps the
  // local "Project path" input available even when a hosted project is currently selected, so dev can
  // always switch to a filesystem scan. Never true in a hosted deployment → the input never appears
  // there (no new host-path attack surface: it exposes a capability that deployment already permits).
  readonly localAllowed?: boolean;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scanCache = useQcScanCache();
  // Host seam: route/API prefixes and the project-persistence action differ per host.
  const { setProject } = useQcHost();
  const qcApi = useQcApi();
  const qcRoute = useQcRoute();
  const runScanRef = useRef<((mode: ScanMode) => void) | null>(null);
  // Refresh = re-scan. There is no sync-down step: every scan reads the project fresh (from the
  // local filesystem in Quality Explorer, from the repo at HEAD in Quality Center), so the scan
  // itself IS the refresh. (An older sync/pull call here belonged to the VM-hosted `qc serve`
  // worktree, which no longer exists in either host.)
  const doRefresh = useCallback(() => {
    runScanRef.current?.("refresh");
  }, []);
  // Stable id for the selected project; the scan result is cached under it so navigating between
  // QC pages reuses it instead of rescanning. Null when nothing is selected.
  const projectKey = project.kind === "none" ? null : project.projectKey;
  const initialUrlState = useRef<{
    readonly viewId?: string;
    readonly navigation: Partial<WorkspaceNavigationState>;
  } | undefined>(undefined);

  if (initialUrlState.current === undefined) {
    const params = new URLSearchParams(searchParams.toString());
    initialUrlState.current = {
      viewId: params.get("view") ?? undefined,
      navigation: navigationFromUrl(params)
    };
  }

  // Hosted project: the box owns the checkout, so there is no local path. Local project: the path
  // comes from the selected project (the `qc_project` cookie), not the URL.
  const [pathInput, setPathInput] = useState(project.kind === "local" ? project.path : "");
  const [selectedViewId, setSelectedViewId] = useState(initialUrlState.current.viewId);
  const [selectedViewNotice, setSelectedViewNotice] = useState<string>();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [currentResult, setCurrentResult] = useState<ScanResult | undefined>();
  const [lastAttemptDiagnostics, setLastAttemptDiagnostics] = useState<
    readonly ScanDiagnostic[]
  >([]);
  const [observationSourceEnv, setObservationSourceEnv] = useState<
    readonly ObservationSourceProfileEnvStatus[]
  >([]);
  const [selectedObservationSetId, setSelectedObservationSetId] = useState<string>();
  const [observationSetSelection, setObservationSetSelection] = useState<ObservationSetSelectionState>({
    branch: "",
    commit: "",
    profileRunIds: {}
  });
  const [isExecutingObservationSource, setIsExecutingObservationSource] = useState(false);
  const [observationExecution, setObservationExecution] = useState<ObservationRuntimeExecutionView>();
  const [observationExecutionDiagnostics, setObservationExecutionDiagnostics] = useState<
    readonly ScanDiagnostic[]
  >([]);
  const [isObservationAuditOpen, setIsObservationAuditOpen] = useState(false);
  const [generatedRecommendations, setGeneratedRecommendations] = useState<GenerateRecommendationsResponse>();
  const [recommendationLoadError, setRecommendationLoadError] = useState<string>();
  const [isRecommendationsOpen, setIsRecommendationsOpen] = useState(false);
  const [navigation, setNavigation] = useState<Partial<WorkspaceNavigationState>>({
    selectedSection: "overview",
    ...initialUrlState.current.navigation
  });
  // The project we've already loaded (from cache) or kicked off a scan for — so we don't rescan on
  // re-render / StrictMode double-invoke, and DO react when the selected project changes.
  const loadedProjectKey = useRef<string | null>(null);

  const diagnostics = useMemo(() => {
    const resultDiagnostics = currentResult?.diagnostics ?? [];
    return [...lastAttemptDiagnostics, ...resultDiagnostics];
  }, [currentResult, lastAttemptDiagnostics]);
  const selectedView = useMemo<Readonly<SavedQcView> | undefined>(
    () => findSavedQcView(currentResult, selectedViewId),
    [currentResult, selectedViewId]
  );
  const availableViews = useMemo(
    () => resolveSavedQcViews(currentResult),
    [currentResult]
  );
  const effectiveResult = useMemo(
    // Saved views scope the Dashboard only. Off the Dashboard — Explorer curation and Reviews —
    // always reflect the whole project (a scoped view would hide features from curation), so a
    // stray `?view=` on those routes must not filter the feature set.
    () => applySavedQcView(currentResult, view === "dashboard" ? selectedViewId : undefined),
    [currentResult, selectedViewId, view]
  );
  const effectiveObservationExecution = useMemo(
    () => filterRuntimeExecutionForResult(observationExecution, effectiveResult),
    [effectiveResult, observationExecution]
  );
  const recommendationRuntimeContextKey = useMemo(
    () =>
      observationExecution === undefined
        ? "no-runtime-context"
        : [
            observationExecution.execution.resolvedCommit ?? "",
            observationExecution.execution.status,
            observationExecution.execution.profiles
              .map((profile) =>
                `${profile.profileId}:${profile.execution.selectedRun?.runId ?? ""}:${profile.execution.selectedRun?.commit ?? ""}`
              )
              .join("|"),
            observationExecution.execution.observations.length
          ].join("::"),
    [observationExecution]
  );
  const recommendationScopeKey = useMemo(
    () =>
      [
        currentResult?.target.resolvedPath ?? "",
        selectedObservationSetId ?? "",
        selectedView?.id ?? "whole-project",
        recommendationRuntimeContextKey
      ].join("::"),
    [currentResult?.target.resolvedPath, recommendationRuntimeContextKey, selectedObservationSetId, selectedView?.id]
  );
  const hasObservationAuditRows = (effectiveObservationExecution?.resolution.auditRows.length ?? 0) > 0;
  const workspace = useMemo(
    () =>
      buildWorkspace({
        result: effectiveResult,
        isLoading: isScanning,
        navigation
      }),
    [effectiveResult, isScanning, navigation]
  );
  const observationProfiles = useMemo<readonly ObservationSourceProfile[]>(
    () => currentResult?.observationSourceProfiles.primary?.document?.profiles ?? [],
    [currentResult]
  );
  const observationSets = useMemo<readonly ObservationSet[]>(
    () => currentResult?.observationSets.primary?.document?.observationSets ?? [],
    [currentResult]
  );
  const hasProjectTarget = workspace.targets.some((target) => target.scope.toLowerCase() === "project");
  const hasUnassignedDiagnostics =
    currentResult !== undefined &&
    !hasProjectTarget &&
    workspace.diagnostics.length > 0;
  const showStandaloneDiagnostics =
    currentResult === undefined || lastAttemptDiagnostics.length > 0 || hasUnassignedDiagnostics;

  useEffect(() => {
    if (currentResult === undefined) {
      setIsObservationAuditOpen(false);
      return;
    }

    if (selectedViewId === undefined) {
      setSelectedViewNotice(undefined);
      return;
    }

    if (availableViews.some((view) => view.id === selectedViewId)) {
      setSelectedViewNotice(undefined);
      return;
    }

    setSelectedViewId(undefined);
    setSelectedViewNotice(`Saved view ${selectedViewId} is no longer available. Showing the whole project.`);
  }, [availableViews, currentResult, selectedViewId]);

  useEffect(() => {
    if (!hasObservationAuditRows) {
      setIsObservationAuditOpen(false);
    }
  }, [hasObservationAuditRows]);

  useEffect(() => {
    setGeneratedRecommendations(undefined);
    setRecommendationLoadError(undefined);
    setIsRecommendationsOpen(false);
  }, [recommendationScopeKey]);

  useEffect(() => {
    if (currentResult === undefined) {
      return;
    }

    const projectPath = currentResult.target.resolvedPath;
    const observationSetId = selectedObservationSetId;
    const viewId = selectedView?.id;
    let isCancelled = false;

    async function loadExistingRecommendations(): Promise<void> {
      try {
        const query = new URLSearchParams();
        query.set("projectPath", projectPath);
        if (observationSetId !== undefined) {
          query.set("observationSetId", observationSetId);
        }
        if (viewId !== undefined) {
          query.set("viewId", viewId);
        }

        const response = await fetch(qcApi(`/recommendations?${query.toString()}`));
        if (isCancelled) {
          return;
        }

        if (response.status === 404) {
          setGeneratedRecommendations(undefined);
          setRecommendationLoadError(undefined);
          return;
        }

        const payload = await response.json() as GenerateRecommendationsResponse | GenerateRecommendationsProblem;
        if (!response.ok) {
          const errorPayload = payload as GenerateRecommendationsProblem;
          setGeneratedRecommendations(undefined);
          setRecommendationLoadError(
            errorPayload.detail ?? errorPayload.title ?? "The saved recommendations file could not be read."
          );
          return;
        }

        setGeneratedRecommendations(payload as GenerateRecommendationsResponse);
        setRecommendationLoadError(undefined);
      } catch {
        if (isCancelled) {
          return;
        }

        setGeneratedRecommendations(undefined);
        setRecommendationLoadError("The saved recommendations file could not be read.");
      }
    }

    void loadExistingRecommendations();

    return () => {
      isCancelled = true;
    };
  }, [currentResult, recommendationRuntimeContextKey, selectedObservationSetId, selectedView?.id]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (observationSets.length === 0) {
      setSelectedObservationSetId(undefined);
      return;
    }

    if (
      selectedObservationSetId !== undefined &&
      observationSets.some((observationSet) => observationSet.id === selectedObservationSetId)
    ) {
      return;
    }

    setSelectedObservationSetId(observationSets[0]?.id);
  }, [observationSets, selectedObservationSetId]);

  useEffect(() => {
    if (!isHydrated || projectKey === null || loadedProjectKey.current === projectKey) {
      return;
    }
    // Reuse a prior scan of this exact project (cached in the persistent layout) — no rescan when
    // navigating between QC pages with the same project selected.
    const cached = scanCache?.get(projectKey);
    if (cached) {
      loadedProjectKey.current = projectKey;
      setCurrentResult(cached.result);
      setObservationSourceEnv(cached.observationSourceEnv);
      return;
    }
    // Cache miss. Hosted project → scan the box's checkout (no path). Local project → scan only when
    // a path is present. None → nothing to do (guarded above).
    const autoPath = project.kind === "local" ? project.path : "";
    const shouldScan = project.kind === "hosted" || (project.kind === "local" && autoPath.length > 0);
    if (!shouldScan) {
      return;
    }
    loadedProjectKey.current = projectKey;
    setCurrentResult(undefined); // drop any prior project's result while this one scans
    void runScan("scan", { projectPath: autoPath, preserveNavigation: true });
  }, [projectKey, isHydrated]);

  useEffect(() => {
    if (currentResult === undefined) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    // Only a local project has a user-meaningful path worth putting in the URL. A hosted project's
    // path is the box's internal checkout dir — keep it out of the URL (the cookie holds the project).
    if (project.kind === "local") {
      params.set("projectPath", currentResult.target.inputPath);
    } else {
      params.delete("projectPath");
    }

    if (workspace.navigation.selectedTargetId === undefined) {
      params.delete("feature");
      params.delete("section");
    } else {
      params.set("feature", workspace.navigation.selectedTargetId);
      params.set("section", workspace.navigation.selectedSection);
    }

    if (
      workspace.navigation.selectedDetailKind === undefined ||
      workspace.navigation.selectedDetailId === undefined
    ) {
      params.delete("detailKind");
      params.delete("detailId");
    } else {
      params.set("detailKind", workspace.navigation.selectedDetailKind);
      params.set("detailId", workspace.navigation.selectedDetailId);
    }

    if (selectedViewId === undefined) {
      params.delete("view");
    } else {
      params.set("view", selectedViewId);
    }

    const query = params.toString();
    const nextUrl = query.length === 0 ? pathname : `${pathname}?${query}`;
    const currentUrl = `${pathname}${searchParams.toString().length === 0 ? "" : `?${searchParams.toString()}`}`;

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [
    currentResult,
    pathname,
    router,
    searchParams,
    selectedViewId,
    workspace.navigation.selectedDetailId,
    workspace.navigation.selectedDetailKind,
    workspace.navigation.selectedSection,
    workspace.navigation.selectedTargetId
  ]);

  async function runScan(
    mode: ScanMode,
    options?: {
      readonly projectPath?: string;
      readonly preserveNavigation?: boolean;
    }
  ): Promise<void> {
    const projectPath = options?.projectPath ?? pathInput;

    setIsScanning(true);
    setLastAttemptDiagnostics([]);
    setObservationExecution(undefined);
    setObservationExecutionDiagnostics([]);
    setGeneratedRecommendations(undefined);
    setRecommendationLoadError(undefined);
    setIsRecommendationsOpen(false);
    if (mode === "scan" && options?.preserveNavigation !== true) {
      setNavigation({ selectedSection: "overview" });
    }

    try {
      const responsePromise = fetch(qcApi("/scan"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectPath,
          mode
        })
      });
      const minimumLoadingTime = new Promise((resolve) => {
        window.setTimeout(resolve, 120);
      });
      const [response] = await Promise.all([responsePromise, minimumLoadingTime]);
      const payload: unknown = await response.json();

      if (!response.ok) {
        const problem = payload as ScanProblem;
        const diagnostic =
          problem.diagnostics?.[0] ??
          fallbackDiagnostic(
            // A diagnostics-less body is almost always the auth 401 ("Sign in first");
            // prefer its title so the user gets an actionable message.
            (payload as { title?: string }).title ?? "The scan failed. Check the project path and try again."
          );

        if (mode === "scan") {
          setCurrentResult(undefined);
        }
        setObservationSourceEnv([]);
        setSelectedObservationSetId(undefined);
        setIsObservationAuditOpen(false);
        setLastAttemptDiagnostics([diagnostic]);
        return;
      }

      const scanResponse = payload as ScanResponse;
      const previousIndex = currentResult === undefined
        ? undefined
        : buildProjectIndex({ result: currentResult });
      const nextIndex = buildProjectIndex({ result: scanResponse.result });
      setCurrentResult(scanResponse.result);
      setObservationSourceEnv(scanResponse.observationSourceEnv);
      // Cache this scan under the current project so navigating away and back reuses it.
      // Drop the cached runtime with it: an evaluation is only meaningful against the
      // structure it was resolved onto, and this scan may have replaced that structure.
      // Keeping it would let a feature page paint pass/fail from a run that never saw
      // the checks now on screen — a claim about the wrong thing, attributed to a real set.
      if (projectKey !== null) {
        scanCache?.set(projectKey, {
          result: scanResponse.result,
          observationSourceEnv: scanResponse.observationSourceEnv,
        });
        scanCache?.clearRuntime(projectKey);
      }
      setIsObservationAuditOpen(false);
      setLastAttemptDiagnostics(
        mode === "refresh" && previousIndex !== undefined
          ? detectSourceClassificationChanges(previousIndex, nextIndex)
          : []
      );
    } catch {
      if (mode === "scan") {
        setCurrentResult(undefined);
      }
      setObservationSourceEnv([]);
      setSelectedObservationSetId(undefined);
      setIsObservationAuditOpen(false);
      setLastAttemptDiagnostics([
        fallbackDiagnostic("The scan failed before a result could be returned.")
      ]);
    } finally {
      setIsScanning(false);
    }
  }

  function submitScan(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const path = pathInput.trim();
    // In a local (dev) deployment, submitting a path selects it as the local project and persists it
    // in the `qc_project` cookie — so it survives reload and routes the scan to the filesystem impl
    // (`getQcDataAccessForRequest`), even when a hosted project was previously selected. This is the
    // only in-UI way back to a local scan (the nav switcher only offers hosted targets). `router.refresh`
    // re-resolves the project server-side (`resolveScannerProject`); the load effect then scans the new
    // path. A no-op re-scan of the already-selected local path skips the write and just re-scans.
    if (localAllowed && path.length > 0 && !(project.kind === "local" && project.path === path)) {
      void (async () => {
        const result = await setProject({ kind: "local", path });
        // Only re-resolve on success — a failed switch (e.g. session expired, or `local` rejected in a
        // non-local deployment) leaves the current project untouched rather than refreshing to the same
        // unchanged cookie and appearing to have done nothing.
        if ("error" in result) return;
        router.refresh();
      })();
      return;
    }
    void runScan("scan");
  }

  // Keep a stable handle to the latest runScan so doRefresh (defined earlier) can invoke it.
  runScanRef.current = (mode) => void runScan(mode);

  async function executeObservationSet(): Promise<void> {
    if (currentResult === undefined || selectedObservationSetId === undefined) {
      return;
    }

    setIsExecutingObservationSource(true);
    setObservationExecution(undefined);
    setObservationExecutionDiagnostics([]);
    setIsObservationAuditOpen(false);
    setGeneratedRecommendations(undefined);
    setRecommendationLoadError(undefined);
    setIsRecommendationsOpen(false);

    try {
      const selection = serializeObservationSetSelection(observationSetSelection);
      const response = await fetch(qcApi("/observation-sets/execute"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectPath: currentResult.target.resolvedPath,
          setId: selectedObservationSetId,
          ...(selectedView === undefined ? {} : { viewId: selectedView.id }),
          ...(selection === undefined ? {} : { selection })
        })
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const problem = payload as ScanProblem;
        setObservationExecutionDiagnostics(
          problem.diagnostics !== undefined && problem.diagnostics.length > 0
            ? problem.diagnostics
            : [fallbackDiagnostic((payload as { title?: string }).title ?? "The observation source could not be executed.")]
        );
        return;
      }

      const executionResponse = payload as ObservationSetExecutionResponse;
      setObservationExecution(executionResponse.result);
      // Hand the evaluated result to the shared cache so a feature page shows
      // proof for the set the viewer just ran, rather than running its own.
      //
      // Only when the run actually produced evaluations. A run with no usable
      // proof — a local report that has not been generated yet, say — still
      // answers 200 and returns an empty `evaluations`, and caching that would
      // put "Runtime proof from <set>" above a feature whose checks carry no
      // badges at all: a claim of proof that is really an absence of it.
      if (projectKey !== null && executionResponse.result.evaluations.length > 0) {
        const observationSet = observationSets.find(
          (candidate) => candidate.id === selectedObservationSetId
        );
        scanCache?.setRuntime(projectKey, {
          observationSetId: selectedObservationSetId,
          observationSetName: observationSet?.name ?? selectedObservationSetId,
          ...(selectedView?.id === undefined ? {} : { viewId: selectedView.id }),
          evaluations: executionResponse.result.evaluations
        });
      } else if (projectKey !== null) {
        scanCache?.clearRuntime(projectKey);
      }
    } catch {
      setObservationExecutionDiagnostics([
        fallbackDiagnostic("The observation set could not be executed.")
      ]);
    } finally {
      setIsExecutingObservationSource(false);
    }
  }

  // The page's single <h1> (WCAG 1.3.1). QC pages don't use PageLayout and have no visible page
  // title (the project switcher is in the left nav), so this is a visually-hidden semantic heading.
  const pageHeading =
    view === "explorer"
      ? "Quality Explorer — Explorer"
      : view === "reviews"
        ? "Quality Explorer — Reviews"
        : "Quality Explorer — Dashboard";

  if (project.kind === "none") {
    return (
      <div className="scanner-shell">
        <VisuallyHidden component="h1">{pageHeading}</VisuallyHidden>
        <Paper withBorder p="xl" radius="md">
          <Stack gap="xs" align="center" ta="center">
            <Title order={2} size="h4">No project selected</Title>
            <Text c="dimmed" size="sm">
              Choose a Quality Explorer project above — a connected repository + branch — to view its quality.
            </Text>
            <Anchor component={Link} href={qcRoute("/manage-projects")} size="sm">
              Connect a project
            </Anchor>
          </Stack>
        </Paper>
      </div>
    );
  }

  return (
    <div className="scanner-shell">
      <VisuallyHidden component="h1">{pageHeading}</VisuallyHidden>
      {/* Refresh lives on the view-selector row below. Only a local (dev) project needs a path input
          here; Enter submits it, or use Refresh. */}
      {project.kind === "local" || localAllowed ? (
        <form className="scanner-form" onSubmit={submitScan}>
          <Group align="flex-end" className="scanner-controls">
            <TextInput
              label="Project path"
              id="project-path"
              name="projectPath"
              disabled={!isHydrated}
              value={pathInput}
              onChange={(event) => setPathInput(event.currentTarget.value)}
              flex={1}
            />
          </Group>
        </form>
      ) : null}

      {isScanning ? <div className="loading-state" role="status">Scanning project</div> : null}

      {showStandaloneDiagnostics ? <ScanDiagnostics diagnostics={diagnostics} /> : null}

      <div className="scanner-meta-controls">
        {/* Saved views scope the Dashboard only. The Explorer is whole-project curation (confirm +
            prioritize every feature, manage project-level sources), so a scoped view has no place
            there; Reviews always cover the whole project. Refresh stays for every view. */}
        {view === "dashboard" ? (
          <>
            <Select
              id="qc-view"
              aria-label="QC view"
              disabled={!isHydrated || currentResult === undefined}
              data={[
                { value: "", label: "Whole project" },
                ...availableViews.map((view) => ({ value: view.id, label: view.name }))
              ]}
              value={selectedViewId ?? ""}
              onChange={(value) => {
                const nextValue = (value ?? "").trim();
                setSelectedViewId(nextValue.length === 0 ? undefined : nextValue);
                setSelectedViewNotice(undefined);
              }}
              allowDeselect={false}
            />
            <Link className="dashboard-link" href={qcRoute("/views")}>
              Manage Views
            </Link>
          </>
        ) : null}
        {/* Refresh (sync-down: pull the latest published state from the repo, then re-scan) sits on
            the far right of this row via ml="auto". Acts on the current project. */}
        <Button
          variant="default"
          ml="auto"
          onClick={doRefresh}
          disabled={projectKey === null || isScanning}
          loading={isScanning}
          leftSection={<RefreshCw aria-hidden size={16} />}
        >
          Refresh
        </Button>
      </div>

      {view === "reviews" ? (
        <Stack gap="md">
          {currentResult === undefined ? (
            <Text c="dimmed">Scan a project above to see what needs your review.</Text>
          ) : (
            <SetupProgress result={currentResult} />
          )}
          <Paper p="md" component="section" aria-label="Saved views">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={2}>
                <Title order={3}>Saved views</Title>
                <Text size="sm" c="dimmed">Reviews always cover the whole project. Saved views scope the Dashboard.</Text>
              </Stack>
              <Anchor component={Link} href={qcRoute("/views")}>
                <Group gap={6}><span>Manage Views</span><ArrowRight aria-hidden size={16} /></Group>
              </Anchor>
            </Group>
          </Paper>
        </Stack>
      ) : (
      <div className={!isObservationAuditOpen && !isRecommendationsOpen ? "workspace-grid workspace-grid-full" : "workspace-grid"}>
        <div className="workspace-main-column">
          {view === "dashboard" ? (
          <div className="workspace-overview-row">
            <OwnerDashboard
              observationExecution={effectiveObservationExecution}
              recommendationContext={currentResult === undefined
                ? undefined
                : {
                    observationSetId: selectedObservationSetId,
                    observationSetName: observationSets.find((observationSet) => observationSet.id === selectedObservationSetId)?.name,
                    generatedRecommendations,
                    isPanelOpen: isRecommendationsOpen,
                    loadError: recommendationLoadError,
                    onOpenPanel: () => {
                      if (generatedRecommendations === undefined || generatedRecommendations.file.recommendations.length === 0) {
                        return;
                      }

                      setIsRecommendationsOpen(true);
                      setIsObservationAuditOpen(false);
                      setNavigation((current) => ({
                        ...current,
                        selectedDetailKind: undefined,
                        selectedDetailId: undefined
                      }));
                    }
                  }}
              selectedView={selectedView}
              viewNotice={selectedViewNotice}
              workspace={workspace}
            />

            <ObservationSourcePanel
              observationSets={observationSets}
              envStatuses={observationSourceEnv}
              execution={effectiveObservationExecution}
              executionDiagnostics={observationExecutionDiagnostics}
              isAuditOpen={isObservationAuditOpen}
              isExecuting={isExecutingObservationSource}
              profiles={observationProfiles}
              scannedProjectPath={currentResult?.target.resolvedPath}
              selectedObservationSetId={selectedObservationSetId}
              observationSetSelection={observationSetSelection}
              onChangeObservationSet={(setId) => {
                setSelectedObservationSetId(setId);
                setObservationSetSelection({
                  branch: "",
                  commit: "",
                  profileRunIds: {}
                });
                setObservationExecution(undefined);
                setObservationExecutionDiagnostics([]);
                setIsObservationAuditOpen(false);
                setGeneratedRecommendations(undefined);
                setRecommendationLoadError(undefined);
                setIsRecommendationsOpen(false);
              }}
              onChangeObservationSetSelection={setObservationSetSelection}
              onExecute={() => void executeObservationSet()}
              onOpenAudit={() => {
                setIsObservationAuditOpen(true);
                setIsRecommendationsOpen(false);
                setNavigation((current) => ({
                  ...current,
                  selectedDetailKind: undefined,
                  selectedDetailId: undefined
                }));
              }}
            />
          </div>
          ) : null}

          {view === "explorer" ? (
          <FeatureIndex
            result={effectiveResult}
            targets={workspace.targets}
            projectName={
              workspace.projectSummary?.projectName ??
              effectiveResult?.projectMaps.primary?.map?.project.name ??
              "Project"
            }
            projectSummary={effectiveResult?.projectMaps.primary?.map?.project.summary}
            projectKey={projectKey}
          />
          ) : null}
        </div>

        {isRecommendationsOpen && generatedRecommendations !== undefined ? (
          <RecommendationsPanel
            onClose={() => setIsRecommendationsOpen(false)}
            payload={generatedRecommendations}
          />
        ) : isObservationAuditOpen && effectiveObservationExecution !== undefined ? (
          <ObservationAuditPanel
            rows={effectiveObservationExecution.resolution.auditRows}
            onClose={() => setIsObservationAuditOpen(false)}
          />
        ) : null}
      </div>
      )}
    </div>
  );
}
