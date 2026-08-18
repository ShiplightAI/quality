# assess — Refresh and explain the quality index

`assess` runs the deterministic engine against the existing graph. It may write
engine-generated recommendation output, but it does not edit graph source,
evidence artifacts, tests, workflows, or reports.

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
- observation set: runtime-result sources, when the project has one
- observed revision/run, when supplied by the source artifacts
- existing `.quality/project-map.yaml`, feature maps, and observation config

If required config is absent or invalid, do not silently create or repair it.
Report the exact missing graph edge and recommend `start` or `improve`.

An observation set is required only for the Quality score. Coverage, evidence
confidence, and structure confidence come from the graph alone. A project with no
observation set is therefore still structurally assessable. Before omitting the
flag, inspect `analyze --help`: the installed CLI must describe
`--observation-set` as optional. Some published 0.3.x versions still require it.
If that older interface is installed, do not run a command known to fail or
invent a set id; report the publication blocker while preserving any static
scores already available from engine artifacts. In the Quality source checkout,
use the repository-local CLI shown in `SKILL.md` to exercise the newer interface.

## Run

From the target repository:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 analyze \
  --project-path <repo-root> \
  --observation-set <observation-set-id> \
  --view <optional-view-id>
```

Omit `--view` for the whole-project scope. Omit `--observation-set` when the
project has none, or when the user asked only for the static scores, **only if
`analyze --help` confirms that the installed command supports it**. The command
then writes `static--<scope>.json` with the three graph-derived scores. Never
invent an observation-set id to satisfy the command.

Read the generated recommendations file identified by the command output. Treat
it as read-only engine output. A view selects features only; it does not select
observation sources or identify a release candidate.

## Interpret

Read the static scores first. They are in `structural_scores` and are always
present when the project has a scorable graph, whatever happened at runtime:

- `coverage_score`, `evidence_confidence_score`, `structure_confidence_score`
- `basis` and `total_check_count`: what those scores were derived from

`quality_score_availability` says whether the Quality score exists:

- `available`: use `runtime_review.quality_score`
- `not_requested`: no observation set was selected
- `unavailable`: an observation set ran but produced no score; `reason` says why

Then separate acquisition from graph resolution. The `runtime_review` block is
absent when no observation set was selected:

- `runtime_review.execution_status` and `profiles[]`: whether result sources
  were acquired and their canonical files passed schema validation
- `runtime_review.resolution_status`: whether observations joined to mapped
  verification methods
- `execution_diagnostics`: source, credential, artifact, or canonical-format
  problems
- `resolution_diagnostics` and `resolution_audit`: unmatched or ambiguous graph
  edges
- `recommendations[]`: concrete failing, missing, weak, stale, or unobserved
  checks

Report the four scores side by side:

- **Coverage:** checks with mapped verification methods
- **Evidence confidence:** strength of mapped methods
- **Quality:** current observed results for executable methods
- **Structure confidence:** trust in features, checks, and priorities

Never blend them. A high runtime score on an unvalidated check list is not a
high-confidence project judgment. When Quality is unavailable, report the other
three as measured and state the reason from `quality_score_availability` — never
mark all four unavailable because runtime data is missing.

Use engine fields for every score and audit total. Do not count checks or gaps
from memory or prose. If presenting a filtered list, state that it is filtered
rather than labeling its length as the project total. Keep structure gates such
as `checks_reviewed` out of the evidence-confidence diagnosis; report them under
structure confidence.

Evaluate policy diagnostics field by field. A generic gate requirement may be
satisfied while an exact required context is not; report the engine's result for
each instead of collapsing them into one natural-language gate concept.

## Report

Include:

- feature scope (whole project or named view) and observation set, or that none
  was selected
- observed revision/run or concrete release candidate, when identifiable
- generated result path
- acquisition and resolution status, when an observation set ran
- the engine-produced scores: always the three static ones, plus Quality with
  its availability reason when it is missing
- highest-priority gaps grouped by the score they affect
- human-gated structure decisions separately from agent-actionable work
- one recommended next command
