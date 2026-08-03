# assess — Refresh and explain the quality index

`assess` runs the deterministic engine against the existing graph. It may write
engine-generated recommendation output, but it does not edit graph source,
proof artifacts, tests, workflows, or reports.

## Read first

- [independence](_shared/independence.md)
- [layout](_shared/layout.md)
- [vocabularies](_shared/vocabularies.md)
- [map-feature](map-feature/index.md) → "Runtime Join Contract"
- [improve](improve/index.md) → "Assessment contract"

## Preconditions

Resolve the assessment identity:

- repository root and its one quality project
- feature scope: whole project or one saved view
- observation set: runtime-result sources
- observed revision/run, when supplied by the source artifacts
- existing `.quality/project-map.yaml`, feature maps, and observation config

If required config is absent or invalid, do not silently create or repair it.
Report the exact missing graph edge and recommend `start` or `improve`.

## Run

From the target repository:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 analyze \
  --project-path <repo-root> \
  --observation-set <observation-set-id> \
  --view <optional-view-id>
```

Omit `--view` for the whole-project scope. Read the generated recommendations
file identified by the command output. Treat it as read-only engine output.
A view selects features only; it does not select observation sources or identify
a release candidate.

## Interpret

Separate acquisition from graph resolution:

- `runtime_review.execution_status` and `profiles[]`: whether result sources
  were acquired and validated
- `runtime_review.resolution_status`: whether observations joined to mapped proof
- `execution_diagnostics`: source, credential, artifact, or canonical-format
  problems
- `resolution_diagnostics` and `resolution_audit`: unmatched or ambiguous graph
  edges
- `recommendations[]`: concrete failing, missing, weak, stale, or unobserved
  checks

Report the four scores side by side:

- **Coverage:** checks with mapped proof
- **Evidence confidence:** strength of mapped proof
- **Quality:** current runtime result of that proof
- **Structure confidence:** trust in features, checks, and priorities

Never blend them. A high runtime score on an unratified check list is not a
high-confidence project judgment.

## Report

Include:

- feature scope (whole project or named view) and observation set
- observed revision/run or concrete release candidate, when identifiable
- generated result path
- acquisition and resolution status
- the four engine-produced scores
- highest-priority gaps grouped by the score they affect
- human-gated structure decisions separately from agent-actionable work
- one recommended next command
