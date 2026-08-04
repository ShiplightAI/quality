export interface DiagnosticGuidanceInput {
  readonly severity: string;
  readonly code: string;
  readonly message: string;
  readonly sourcePath?: string;
  readonly affectedPath?: string;
  readonly affectedTargetId?: string;
}

export interface DiagnosticGuidance {
  readonly title: string;
  readonly explanation: string;
  readonly recommendedAction: string;
  readonly agentPrompt: string;
}

function sourceLabel(input: DiagnosticGuidanceInput): string {
  return input.sourcePath ?? input.affectedPath ?? input.affectedTargetId ?? "the scan result";
}

function guidanceText(input: DiagnosticGuidanceInput): Omit<DiagnosticGuidance, "agentPrompt"> {
  const source = sourceLabel(input);

  switch (input.code) {
    case "EMPTY_PATH":
      return {
        title: "Missing project path",
        explanation: "The scan did not run because no local project directory was provided.",
        recommendedAction: "Enter the absolute path to the project directory and scan again."
      };
    case "MISSING_PATH":
      return {
        title: "Project path not found",
        explanation: "The path does not exist on this machine, so the quality scanner could not scan it.",
        recommendedAction: "Check the path spelling or choose an existing local project directory."
      };
    case "NON_LOCAL_PATH":
      return {
        title: "Non-local path",
        explanation: "The quality scanner only scans local directories and will not fetch remote paths or URLs.",
        recommendedAction: "Use a checked-out local repository path, then scan again."
      };
    case "NON_DIRECTORY_TARGET":
      return {
        title: "Path is not a directory",
        explanation: "The selected path points to a file instead of a project directory.",
        recommendedAction: "Select the containing project directory and scan again."
      };
    case "UNREADABLE_DIRECTORY":
      return {
        title: "Unreadable directory",
        explanation: `The scanner could not read ${source}, so files under that directory may be missing from the overview.`,
        recommendedAction:
          "Fix local filesystem permissions or remove the unreadable directory from the quality artifact layout."
      };
    case "UNREADABLE_ARTIFACT_FILE":
      return {
        title: "Unreadable artifact",
        explanation: `The scanner found ${source}, but could not read its contents.`,
        recommendedAction: "Fix local file permissions or replace the unreadable artifact with a readable copy."
      };
    case "OUT_OF_PROJECT_ARTIFACT":
      return {
        title: "Artifact outside project",
        explanation: `The artifact reference ${source} resolves outside the scanned project, so it was skipped for local safety.`,
        recommendedAction: "Move the artifact inside the project or update the reference to a project-relative path."
      };
    case "DUPLICATE_ARTIFACT_MATCH":
      return {
        title: "Duplicate artifact pattern",
        explanation: `The same artifact matched more than one supported scan pattern. The quality scanner kept one copy and ignored the duplicate match.`,
        recommendedAction:
          "Usually no action is required. To remove the notice, keep the artifact in only one supported layout or adjust duplicate references."
      };
    case "NO_ARTIFACTS_FOUND":
      return {
        title: "No quality artifacts found",
        explanation:
          "The scan completed, but no project structure file, quality map, test spec, or test report artifacts were found.",
        recommendedAction:
          "Add a project structure file such as project-map.yaml, quality-map.yaml, test-spec.md, or test-report.md in a supported quality evidence directory."
      };
    case "FAILED_REFRESH":
    case "SCAN_FAILED":
      return {
        title: "Scan failed",
        explanation: "The scan did not produce a complete result.",
        recommendedAction: "Review the path and any listed diagnostics, then rerun the scan."
      };
    case "TARGET_SOURCE_CLASSIFICATION_CHANGED":
      return {
        title: "Feature source changed",
        explanation:
          "A refresh found the same feature through a different source type, such as project structure instead of Markdown fallback.",
        recommendedAction:
          "Review the feature source references and confirm the preferred project structure or quality-map source is present."
      };
    case "INVALID_YAML":
    case "QUALITY_MAP_PARSE_FAILED":
    case "INVALID_PROJECT_MAP_YAML":
      return {
        title: "Invalid YAML",
        explanation: `${source} could not be parsed as valid YAML, so structured quality data may be unavailable.`,
        recommendedAction: "Open the referenced YAML file, fix the syntax error, and scan again."
      };
    case "UNKNOWN_FIELD":
      return {
        title: "Unknown quality-map field",
        explanation: `${source} contains a field that is not part of the supported quality-map schema.`,
        recommendedAction: "Remove the unknown field or move the information into a supported schema field."
      };
    case "INVALID_FIELD_SHAPE":
      return {
        title: "Invalid field shape",
        explanation: `${source} has a field with the wrong data type or nested structure.`,
        recommendedAction: "Update the field to match the quality-map schema expected for that section."
      };
    case "MISSING_SCHEMA_VERSION":
    case "INVALID_SCHEMA_VERSION":
    case "UNSUPPORTED_SCHEMA_VERSION":
      return {
        title: "Schema version problem",
        explanation: `${source} is missing a supported quality-map schema version.`,
        recommendedAction: "Set schema_version to a supported value and scan again."
      };
    case "DUPLICATE_ENTITY_ID":
      return {
        title: "Duplicate ID",
        explanation: `${source} defines the same entity ID more than once, making traceability ambiguous.`,
        recommendedAction:
          "Rename one of the duplicate IDs so each target, expectation, evidence item, and risk is unique."
      };
    case "NON_CANONICAL_EVIDENCE_PATH":
      return {
        title: "Non-canonical evidence path",
        explanation: `${source} uses an evidence.path that is not in canonical repo-relative form, which weakens runtime proof joins.`,
        recommendedAction:
          "Rewrite evidence.path to the repo-relative file path using forward slashes and no leading ./ or absolute prefix."
      };
    case "MISSING_EVIDENCE_FILE":
      return {
        title: "Missing evidence file",
        explanation: `${source} references an evidence.path that does not exist in the scanned repo.`,
        recommendedAction:
          "Fix the stale evidence.path, restore the missing file, or remove the broken evidence entry if it no longer applies."
      };
    case "MISSING_OBSERVATION_ARTIFACT_MATCH":
      return {
        title: "Missing runtime observation artifact",
        explanation:
          "The quality scanner selected a runtime observation source, but the selected run or folder did not contain the canonical quality-observations file named by observation_path.",
        recommendedAction:
          "In the target repo, open .quality/config/observation-sources.yaml, find the named profile, then inspect the selected workflow run's uploaded artifacts. Make the smallest fix: update github.artifact_names or observation_path to match the real upload, make the workflow publish the canonical quality-observations JSON file, or restrict the source to runs where the observation-producing job actually runs."
      };
    case "INCOMPLETE_OBSERVATION_ARTIFACT_MATCH":
      return {
        title: "Partial runtime observation upload",
        explanation:
          "The selected run published some, but not all, of the artifacts the profile names. The observations that did arrive are used; every check proven only by a missing artifact reads unobserved for this run, which looks identical to having no proof at all.",
        recommendedAction:
          "Check whether the job that publishes the missing artifact failed, was skipped, or was cancelled in the selected run. Either fix that job so it publishes on the paths it should, or drop the artifact name from github.artifact_names if it is no longer produced."
      };
    case "UNREADABLE_MARKDOWN_ARTIFACT":
      return {
        title: "Unreadable Markdown",
        explanation: `${source} was discovered but could not be read as Markdown.`,
        recommendedAction: "Fix file permissions or replace the Markdown artifact with a readable file."
      };
    case "EMPTY_MARKDOWN_ARTIFACT":
      return {
        title: "Empty Markdown",
        explanation: `${source} has no content, so it cannot provide feature context or evidence hints.`,
        recommendedAction: "Add the expected Markdown sections or remove the empty artifact."
      };
    case "NO_RECOGNIZED_HEADINGS":
      return {
        title: "Unrecognized Markdown structure",
        explanation: `${source} was preserved as narrative, but the quality scanner could not identify expected quality sections.`,
        recommendedAction:
          "Add recognized headings such as Testing What, Coverage Matrix, Evidence, Findings, or Residual Risks."
      };
    case "MISSING_MARKDOWN_SECTION":
      return {
        title: "Markdown section missing",
        explanation: `${source} is missing one of the expected quality evidence sections.`,
        recommendedAction: "Add the missing section or use a structured quality-map.yaml for stronger traceability."
      };
    case "DUPLICATE_MARKDOWN_HEADING":
      return {
        title: "Duplicate Markdown heading",
        explanation: `${source} has repeated recognized headings, so the quality scanner preserved them but may not infer intent clearly.`,
        recommendedAction:
          "Merge duplicate sections or rename one heading so each quality section has one clear purpose."
      };
    case "MALFORMED_MARKDOWN_TABLE":
      return {
        title: "Malformed Markdown table",
        explanation: `${source} contains a table that could not be normalized into coverage rows.`,
        recommendedAction: "Fix the Markdown table header, separator row, and cell counts, then scan again."
      };
    case "UNREADABLE_PROJECT_MAP":
      return {
        title: "Unreadable project structure",
        explanation: `${source} was discovered as a project structure file but could not be read.`,
        recommendedAction: "Fix file permissions or replace the project structure file with readable YAML."
      };
    case "EMPTY_OR_NON_OBJECT_PROJECT_MAP":
      return {
        title: "Invalid project structure shape",
        explanation: `${source} must contain a YAML object with project or feature entries.`,
        recommendedAction:
          "Update the project structure file to include project metadata, source references, or features."
      };
    case "PROJECT_MAP_HAS_NO_ENTRIES":
      return {
        title: "Project structure has no entries",
        explanation: `${source} parsed, but it does not list project sources or features to show in the overview.`,
        recommendedAction: "Add project source references or at least one feature entry to the project structure file."
      };
    default:
      return {
        title: input.code.toLowerCase().replaceAll("_", " "),
        explanation: input.message,
        recommendedAction:
          "Inspect the referenced source and rerun the scan after making the smallest corrective change."
      };
  }
}

export function diagnosticGuidanceFor(input: DiagnosticGuidanceInput): DiagnosticGuidance {
  const text = guidanceText(input);
  const source = sourceLabel(input);
  const agentPrompt = [
    `Quality scan diagnostic ${input.code} (${input.severity}) needs review.`,
    `Source: ${source}.`,
    `Message: ${input.message}`,
    ...(input.code === "MISSING_OBSERVATION_ARTIFACT_MATCH"
      ? [
          "This prompt is for the coding agent working in the scanned target repository, not for the quality scanner itself.",
          "Check .quality/config/observation-sources.yaml in the target repo for the named profile.",
          "For GitHub Actions profiles, inspect the workflow run selected by the diagnostic message or source UI, list its uploaded artifacts, unzip/download the matched artifact, and verify it contains the canonical JSON file named by observation_path.",
          "If the latest completed workflow run is a promote/deploy-only run that skips tests or observation upload, fix the target repo configuration or workflow so QC selects an observation-producing run or the promote path publishes/reuses the expected observation manifests."
        ]
      : []),
    `Meaning: ${text.explanation}`,
    `Requested action: ${text.recommendedAction}`,
    "Inspect the referenced local files, explain the root cause, and make the minimal repo change needed to resolve the diagnostic. Preserve read-only scan behavior."
  ].join("\n");

  return {
    ...text,
    agentPrompt
  };
}
