import {
  executeObservationSetOp,
  executeObservationSourceOp,
  getFixPromptOp,
  getRecommendationsOp,
  QcOperationError,
  readMarkdownArtifactOp,
  scanOp,
} from "@shiplightai/quality-core/operations";
import type { QcDataAccess } from "./types";
import { qualityProjectRoot } from "../project-root";

// Draft/preview/publish sync has no meaning in local `qc` mode (no origin, no PR flow) —
// mirror the box's `qc-sync-unavailable` 400 so routes surface it consistently.
const syncUnavailable = (): never => {
  throw new QcOperationError(400, "Sync is not available in local mode.", { code: "qc-sync-unavailable" });
};

const readOnly = (): never => {
  throw new QcOperationError(405, "Quality Explorer is read-only; edit .quality/** through code review.", {
    code: "qc-read-only",
  });
};

// Every operation pins projectPath to the startup-selected root. Client input
// cannot make this local server inspect another filesystem location.
export const localFsDataAccess: QcDataAccess = {
  scan: (input) => scanOp({ ...input, projectPath: qualityProjectRoot() }),
  getRecommendations: (input) => getRecommendationsOp({ ...input, projectPath: qualityProjectRoot() }),
  readMarkdownArtifact: (_projectPath, artifactPath) => readMarkdownArtifactOp(qualityProjectRoot(), artifactPath),
  getFixPrompt: (input) => getFixPromptOp({ ...input, projectPath: qualityProjectRoot() }),
  saveFeatures: () => readOnly(),
  saveSources: () => readOnly(),
  saveQualityMap: () => readOnly(),
  saveObservationSets: () => readOnly(),
  saveObservationSources: () => readOnly(),
  saveViews: () => readOnly(),
  executeObservationSet: (input) => executeObservationSetOp({ ...input, projectPath: qualityProjectRoot() }),
  executeObservationSource: (input) => executeObservationSourceOp({ ...input, projectPath: qualityProjectRoot() }),
  syncStatus: () => syncUnavailable(),
  pull: () => syncUnavailable(),
  publish: () => syncUnavailable(),
  discard: () => syncUnavailable(),
};
