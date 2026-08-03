"use client";

import { PanelRightOpen } from "lucide-react";
import { Button } from "@mantine/core";
import type { SavedQcView } from "@shiplightai/quality-core";
import { HelpTooltip } from "./HelpTooltip";
import type { GenerateRecommendationsResponse } from "@/lib/quality-explorer/ranked-recommendations";

interface TopLeverageRecommendationsProps {
  readonly observationSetId?: string;
  readonly observationSetName?: string;
  readonly generatedRecommendations?: GenerateRecommendationsResponse;
  readonly isPanelOpen: boolean;
  readonly loadError?: string;
  readonly projectPath?: string;
  readonly selectedView?: SavedQcView;
  onOpenPanel(): void;
}

function recommendationScopeLabel(selectedView: SavedQcView | undefined): string {
  return selectedView === undefined ? "the whole project" : selectedView.name;
}

function displayOutputPath(payload: GenerateRecommendationsResponse): string {
  return payload.path.startsWith(`${payload.file.project_root}/`)
    ? payload.path.slice(payload.file.project_root.length + 1)
    : payload.path;
}

export function TopLeverageRecommendations({
  observationSetId,
  observationSetName,
  generatedRecommendations,
  isPanelOpen,
  loadError,
  projectPath,
  selectedView,
  onOpenPanel
}: TopLeverageRecommendationsProps): React.ReactElement {
  const selectionSummary = `${observationSetName ?? observationSetId ?? "Saved observation set"} for ${recommendationScopeLabel(selectedView)}`;

  return (
    <section className="overview-recommendations" aria-label="Top leverage recommendations">
      <div className="overview-recommendations-header">
        <div>
          <p className="eyebrow">Recommendations</p>
          <h3>
            Ranked fix queue
            <HelpTooltip text="View the repo-owned ranked recommendations file for the current observation scope. Quality Explorer reads the machine-readable queue from .quality/generated/recommendations and opens the full recommendation list in the right-side detail rail. Generate the file with the quality-tools analyze command." />
          </h3>
          <p className="dashboard-subtitle">
            Ranked fix queue for {selectionSummary}.
          </p>
        </div>
      </div>

      {observationSetId === undefined || projectPath === undefined ? (
        <p className="muted-text">Select and run a saved observation set to view its recommendations.</p>
      ) : generatedRecommendations === undefined ? (
        <>
          {loadError === undefined ? null : <p className="recoverable-notice">{loadError}</p>}
          <p className="muted-text">
            No recommendations file was found for {recommendationScopeLabel(selectedView)}. Generate one with{" "}
            <code>quality-tools analyze</code>; Quality Explorer reads it from{" "}
            <code>.quality/generated/recommendations/</code>.
          </p>
        </>
      ) : (
        <>
          {loadError === undefined ? null : <p className="recoverable-notice">{loadError}</p>}

          {generatedRecommendations.file.recommendations.length > 0 ? (
            <div className="overview-recommendation-buttons">
              <Button
                variant="default"
                size="xs"
                leftSection={<PanelRightOpen aria-hidden size={16} />}
                onClick={onOpenPanel}
              >
                {isPanelOpen ? "Recommendations open" : "Open recommendations"}
              </Button>
            </div>
          ) : null}

          <div className="overview-recommendation-status">
            <span>Generated {new Date(generatedRecommendations.file.generated_at).toLocaleString()}</span>
            <span>{displayOutputPath(generatedRecommendations)}</span>
            {generatedRecommendations.file.runtime_review.quality_score === undefined ? null : (
              <span>Score {generatedRecommendations.file.runtime_review.quality_score} / 100</span>
            )}
          </div>

          {generatedRecommendations.file.recommendations.length === 0 ? (
            <p className="muted-text">All evaluated runtime checks passed in the recommendations file.</p>
          ) : (
            <div className="overview-recommendation-status">
              <span>
                {generatedRecommendations.file.recommendations.length} ranked recommendation{generatedRecommendations.file.recommendations.length === 1 ? "" : "s"} available.
              </span>
              <span>Open the right-side detail rail to review the full queue.</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
