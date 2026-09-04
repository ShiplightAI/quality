import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDiagnostic } from "../diagnostics/diagnostic";
import type { ScanDiagnostic } from "../diagnostics/diagnostic";
import { buildPlaywrightObservationBatch, buildShiplightObservationBatch } from "../observations";
import type { ObservationEvidenceRefInput } from "../observations";
import type { HostObservationTransport, ObservationSourceProfile } from "./types";

/**
 * The bundled reference host transport, and the one that makes run evidence
 * work with no platform at all: it reads a native test report from the working
 * tree and hands the engine its results, pointing each one at the HTML report
 * the runner already wrote.
 *
 * It deliberately does NOT enumerate videos, traces, or screenshots. Quality is
 * an index from checks to evidence, not a viewer — the runner's report is
 * already the viewer, the reviewer already knows it, and rebuilding a worse one
 * inside the quality UI would earn nothing. So the evidence pointer is the
 * report, and the report handles presentation.
 *
 * It is also the worked example every other host transport is written against,
 * including the platform ones that live outside this repo.
 *
 * Registration is still the host's decision. This module only offers the
 * factory; nothing here registers itself.
 *
 * Config:
 *
 *   - id: local-playwright
 *     name: Local Playwright run
 *     transport: host
 *     host:
 *       provider: local-reports
 *       options:
 *         path: playwright-report/report.json   # results to read
 *         report: playwright-report/index.html  # what a reviewer opens
 *         format: playwright-json               # optional; see below
 *         commit: <sha>                         # optional, see below
 *
 * `format` selects which report the run left behind:
 *
 *   playwright-json   Playwright's JSON reporter output.
 *   shiplight-report  A Shiplight YAML run's `report-data.json`, which keys its
 *                     results on the TRANSPILED spec; that adapter maps them
 *                     back to the `.test.yaml` source a quality map can pin.
 */

export const LOCAL_REPORTS_PROVIDER = "local-reports";

const SUPPORTED_FORMATS = new Set(["playwright-json", "shiplight-report"]);

const REPORT_LABEL = "Test report";

function invalid(message: string): ScanDiagnostic {
  return createDiagnostic({ severity: "error", code: "INVALID_OBSERVATION_SOURCE", message });
}

function missingReport(message: string): ScanDiagnostic {
  return createDiagnostic({
    severity: "warning",
    code: "MISSING_OBSERVATION_ARTIFACT_MATCH",
    message
  });
}

function resolveOption(
  profile: ObservationSourceProfile,
  option: "path" | "report",
  projectRoot: string | undefined
): { readonly resolved?: string; readonly diagnostic?: ScanDiagnostic } {
  const declared = profile.host?.options[option];
  if (declared === undefined || declared.length === 0) {
    return {
      diagnostic: invalid(
        `Observation source profile ${profile.id} needs host.options.${option} naming a file under the project.`
      )
    };
  }

  if (projectRoot === undefined) {
    return {
      diagnostic: invalid(
        `Observation source profile ${profile.id} needs a project root to resolve the path ${declared}.`
      )
    };
  }

  // Contained to the project root on purpose, and containment is checked for an
  // ABSOLUTE declaration too. A profile is repo config: letting `/etc/hosts`
  // through while refusing `../../etc/hosts` would enforce nothing, since a PR
  // can write either. `path.resolve` returns an absolute declaration unchanged,
  // so both forms reach the same comparison.
  const resolved = path.resolve(projectRoot, declared);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return {
      diagnostic: invalid(
        `Observation source profile ${profile.id} resolves host.options.${option} ${declared} outside the project root.`
      )
    };
  }

  return { resolved };
}

// The one evidence pointer this transport produces: the report a reviewer
// opens. It is attached to every observation the run produced, because that is
// what it is — one report describing the whole run. Quality links to it and
// stops there; the report is the viewer.
function reportRef(
  profile: ObservationSourceProfile,
  projectRoot: string | undefined
): { readonly refs: readonly ObservationEvidenceRefInput[]; readonly diagnostics: readonly ScanDiagnostic[] } {
  const declared = profile.host?.options.report;
  if (declared === undefined || declared.length === 0) {
    return { refs: [], diagnostics: [] };
  }

  if (/^https?:\/\//i.test(declared)) {
    return { refs: [{ ref: declared, label: REPORT_LABEL }], diagnostics: [] };
  }

  const location = resolveOption(profile, "report", projectRoot);
  if (location.resolved === undefined) {
    return { refs: [], diagnostics: location.diagnostic === undefined ? [] : [location.diagnostic] };
  }

  // Recorded project-root-relative rather than absolute, so the ref means the
  // same thing to every reader of this repo instead of encoding one machine's
  // checkout location. `resolveOption` has already refused anything that lands
  // outside the root, so this is always a contained path.
  const ref = path.relative(projectRoot ?? "", location.resolved);
  return { refs: [{ ref: ref.replaceAll("\\", "/"), label: REPORT_LABEL }], diagnostics: [] };
}

export function createLocalReportsTransport(): HostObservationTransport {
  return async ({ profile, projectRoot }) => {
    const format = profile.host?.options.format ?? "playwright-json";
    if (!SUPPORTED_FORMATS.has(format)) {
      return {
        batches: [],
        diagnostics: [
          invalid(
            `Observation source profile ${profile.id} asks for report format ${format}; ${LOCAL_REPORTS_PROVIDER} supports ${[...SUPPORTED_FORMATS].join(", ")}.`
          )
        ]
      };
    }

    const location = resolveOption(profile, "path", projectRoot);
    if (location.resolved === undefined) {
      return { batches: [], diagnostics: location.diagnostic === undefined ? [] : [location.diagnostic] };
    }

    let reportJson: string;
    try {
      reportJson = await readFile(location.resolved, "utf8");
    } catch (error) {
      // `warning`, not `error`, because "you have not run the suite yet" is an
      // ordinary state for a local source and the message should read as
      // guidance rather than a fault.
      //
      // The EXECUTION STATUS is still `invalid`, and deliberately so: a source
      // that produced no observations read nothing, and `statusFor` is right to
      // say so. Downgrading this to `info` to soften the status would report the
      // same empty read as `valid`, which is a worse lie than a red badge.
      return {
        batches: [],
        diagnostics: [
          missingReport(
            `Observation source profile ${profile.id} could not read the report at ${location.resolved}: ${error instanceof Error ? error.message : String(error)}`
          )
        ]
      };
    }

    // A local report records no commit. Rather than stamp the working tree's
    // HEAD onto results that may predate it — inventing provenance the report
    // never claimed — the commit stays absent unless config pins one. The
    // diagnostic says so, because an unpinned observation is skipped by any
    // commit-scoped evaluation and that silence would otherwise look like a bug.
    const commit = profile.host?.options.commit;
    const diagnostics: ScanDiagnostic[] =
      commit === undefined
        ? [
            createDiagnostic({
              severity: "info",
              code: "INVALID_OBSERVATION_SELECTION",
              message: `Observation source profile ${profile.id} read a local report that records no commit, so a commit-scoped evaluation will not count it. Set host.options.commit to pin one.`
            })
          ]
        : [];

    const source = {
      id: profile.id,
      kind: LOCAL_REPORTS_PROVIDER,
      label: profile.name
    };
    const revision = commit === undefined ? {} : { revision: { commit } };
    const report = reportRef(profile, projectRoot);

    const built =
      format === "shiplight-report"
        ? buildShiplightObservationBatch({
            report_json: reportJson,
            source,
            ...revision,
            evidence_refs: report.refs
          })
        : buildPlaywrightObservationBatch({ report_json: reportJson, source, ...revision });

    const batch =
      built.batch === undefined || report.refs.length === 0
        ? built.batch
        : {
            ...built.batch,
            observations: (built.batch.observations ?? []).map((observation) => ({
              ...observation,
              evidence_refs: report.refs
            }))
          };

    return {
      batches: batch === undefined ? [] : [batch],
      diagnostics: [...diagnostics, ...report.diagnostics, ...built.diagnostics]
    };
  };
}
