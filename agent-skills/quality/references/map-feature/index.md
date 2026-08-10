# map-feature — Map one feature's checks and proof

`map-feature <target>` constructs or improves one feature's section of the
quality graph:

```text
feature → quality checks → proof definitions
```

It writes the feature's `quality-map.yaml` from accepted requirements and
existing proof artifacts so the engine can score coverage, evidence confidence,
and structure confidence.

## Contents

- Boundaries, inputs, and graph artifact
- Check and proof authoring rules
- Structure provenance and human gates
- Runtime join contract
- Workflow, validation, and edit boundaries

## Read first

- [independence](../_shared/independence.md)
- [layout](../_shared/layout.md)
- [vocabularies](../_shared/vocabularies.md)

Work on one feature, spec, module, PR, or ticket at a time. The outcome is a
trustworthy answer to two questions: what must hold for this feature, and what
existing artifact proves each check?

`map-feature` reads proof facts and connects them to the graph; it does not
generate the proof:

- It does **not** create tests or pick testing strategy — that is `/shiplight
  cover`. This command reads the test-spec, the test-report, and the actual
  test files and indexes what exists.
- It does **not** wire observations, observation sets, or saved views—that is
  `improve`; it does not run the engine—that is `assess`.
- It does **not** author `.quality/project-map.yaml`—that is `map-project`.

Project-wide quality improvement across many feature maps belongs to the
`improve` command. When the request is about overall project quality rather
than one feature's graph, use that command.

## Graph layer and artifact

Per target, at `.quality/evidence/<target-slug>/quality-map.yaml`: the structural
proof-definition graph — the quality checks (`expectations`), each carrying a
declared `priority`, evidence rows (`type` + `path`), `structure_provenance`,
and `proof_gap` guidance. It is structural only: no run outcomes, timestamps,
freshness, or confidence rollups (those are observations/evaluations).

It does **not** author `test-spec.md` / `test-report.md` (owned by
`/shiplight cover`, in `specs/<feature>/`), the dev-owned testing strategy
(`TESTING.md`), `.quality/project-map.yaml` (owned by `map-project`), or
`.quality/config/*` and `.quality/generated/*` (owned by `improve` and the
engine).

## Inputs, Facts, And Independence

Build the map from whatever facts exist — `specs/<feature>/test-spec.md` (the
testing-what and each behavior's declared priority), `specs/<feature>/test-report.md`
(the test types written and session results), the actual test files, code,
schemas, routes, and CI, and the PRD/spec for declared priorities. Construction
is the same path whether spec-driven or brownfield; only the confidence differs —
spec-driven inputs yield high structure confidence, inference from code/tests
alone starts `inferred_brownfield` until a human ratifies it.

This skill **records two facts and derives scores from them; it authors no
judgments**, and it verifies facts rather than copying the dev session's claims:

- **`priority` (P0–P3)** — read from the declaring artifact (PRD, feature
  breakdown, spec, or per-behavior test-spec), never invented. Mark `UNKNOWN`
  when nothing declares it; do not guess. It is the importance signal — there is
  no 1–5 risk weight — and its trust rides on `structure_provenance`.
- **Evidence `type`** — a fact about the cited proof definition, confirmed from
  what it actually executes at `evidence.path` and optional `evidence.test_case`,
  not copied from its filename, directory, runner, or report label. Classify the
  execution boundary: isolated behavior is `unit`; proof that exercises a
  contract or interaction across real components is `contract` or `integration`
  even when external infrastructure is simulated. Evidence confidence is
  **derived from type** by a transparent rubric (manual < single automated <
  direct automated + gate); do not author `depth`, `reliability`, or a
  `HIGH/MEDIUM/LOW` verdict — flakiness, staleness, and pass/fail come from
  runtime observations joined on `path` and optional `test_case`.

## Target Slug Naming

Use stable `NNN-kebab-case-name` slugs so specs, tasks, maps, reports, tests,
and UI routes join reliably. If `specs/NNN-feature-name` exists, the default
index target is `.quality/evidence/NNN-feature-name/`. Reuse an existing numeric
prefix; never drop `NNN-`. Mint a new slug only for a genuine feature or spec,
never to host project-wide or multi-feature work. Preserve old slugs under
`target.aliases`.

## Quality Map

Maintain `quality-map.yaml` around quality checks, not test files. Checks live
under `expectations`. Each should include:

- Stable check id and title (user-facing language).
- Source type: `SOURCE`, `IMPLEMENTATION`, or `INFERRED`.
- Source references to specs, PRDs, issues, code, docs, or user input.
- Category and `priority` (read as a fact from the declaring artifact).
- Related implementation tasks when available.
- Evidence rows: schema-valid `type` at a `path` (+ optional `test_case`,
  `contexts`), the type confirmed against the artifact.
- Optional `proof_gap` describing what proof is still missing and what to add
  next.

Keep the map structural: proof definitions, declared priority, and proof gaps
belong here; run outcomes and derived judgments do not. Preserve stable ids so
downstream observation and evaluation systems can join on them. Copy
`assets/quality-map.template.yaml` for new maps and validate with
`npx --yes @shiplightai/quality-tools@^0.3.0 validate <map-path>` (the engine's own
validator; see "Validate" below).

## Unit Test Evidence

Treat unit tests as code-level evidence by default. They can be strong primary
evidence only when the check itself is confined to a small deterministic
implementation contract with no meaningful dependency on runtime wiring,
external state, integration behavior, or user workflow. Examples include pure
parsing or formatting rules, schema validation, deterministic serialization,
local routing decisions, and narrow safety guards.

For user-facing workflows or boundary-spanning claims, unit tests may support
the check but should not close it alone. This includes, but is not limited to,
claims whose correctness depends on integration between components, user or
runtime state, external systems, persistence, permissions, transport/protocol
behavior, browser or CLI execution, deployment wiring, or release gates.

## Evidence Type Consistency

Before adding an evidence row, search existing quality maps for the same `path`
and optional `test_case`. Reuse a previously verified type when it describes the
same proof boundary. If an existing mapping conflicts with the artifact, report
the conflict and use the type justified by inspection; do not silently create a
second classification.

A file can contain proofs with different boundaries. Distinguish them with
`test_case` and classify each cited case independently. Unpinned file-level
evidence must accurately describe the proof claimed for the file as a whole;
do not use an unpinned row to hide mixed execution modes. Different types for
one path are valid only when distinct pinned cases actually exercise different
boundaries.

Before validation, audit the whole project for each evidence path. Choose one
identity strategy per path: file-level, or exact pins for every mapped case.
Report and resolve mixed pinned/unpinned rows; schema validity alone does not
prove that runtime observations will resolve unambiguously.

## Structure Provenance And Structure Confidence

Declare `structure_provenance` at the top of `quality-map.yaml` (and optionally
per check) so the `quality-tools` engine can report **structure confidence** — how much the
map's structure (its set of checks *and their priorities*) can be trusted — as a
separate axis from evidence confidence. Evidence confidence asks "is each check
proven?"; structure confidence asks "is this the right set of checks at the
right priorities, and where did it come from?". The two are reported side by
side and never blended.

Choose the value honestly from how the check list was actually produced:

- `spec` — derived from a written spec/PRD/Speckit artifact.
- `user_authored` — a human defined the checks directly.
- `agent_generated` — an agent produced the checks (this records *origin only*; a
  human's review of the list is a separate gate, `checks_reviewed` — see below).
- `inferred_brownfield` — reconstructed from existing code/tests after the fact,
  not yet validated against intended requirements.
- `unspecified` — origin undeclared; the default. Scores 0 and is counted in the
  structure-confidence denominator (it is the human anchor — unattested structure
  earns no trust), so declare an honest value to lift it.

Rules:

- Set the map-level value on every map you author or repair; add a per-check
  value only for genuine exceptions.
- Prefer an honest `unspecified` over a guessed origin. A wrong `spec` lies that
  the structure is trustworthy.
- Never infer provenance from heuristics (git dates, whether a spec file exists)
  and record it as declared.
- Reconcile the field with the map's own source references and comments. For
  example, a map described as reconstructed from implementation cannot also
  claim `user_authored`; human review belongs in `checks_reviewed` and never
  rewrites the origin.
- Determine origin from the source of the check list, not the author of the YAML:
  use `spec` when the complete list and priorities trace to accepted
  requirements, even when an agent performs the transcription. Use per-check
  provenance for inferred additions instead of downgrading the whole map.

`structure_provenance` is an **origin ladder**, not an agent edit:
`inferred_brownfield` (0.4) → `agent_generated` (0.7) → `user_authored` / `spec`
(1.0). The agent may author at `inferred_brownfield` and *propose* checks and
priorities, but must not record `user_authored`/`spec` without genuine human
authorship or an accepted spec. Origin is not review — an `agent_generated` list a
human has *approved* still reads `agent_generated`; the approval is recorded by
`checks_reviewed` (below), which the engine treats as the review gate.

### `checks_reviewed` — gate 4 (map-level human review)

Set `checks_reviewed: true` at the map level ONLY when a human has reviewed and
approved the whole check list. Combined with a confirmed feature (gate 2), it lifts
that feature's checks to **HIGH** structure confidence (1.0), overriding the gate-1
origin ladder — so a human-approved `agent_generated` list scores HIGH without
rewriting its origin. It is **human-gated**: surface the unratified checks —
highest-priority first — for review; *propose* the reviewed list, but never flip
`checks_reviewed` to true on the owner's behalf. No test and no `fix-prompts` run can
raise it. (Mapping more proof and stronger types raises coverage and evidence
confidence, reported beside structure confidence and never substituting for it.)

### `accepted_gaps` — accepted risk (human-gated)

A per-check list of gap **categories** a human has reviewed and accepted as tolerated
risk: a subset of `missing, stale, deferred, manual-only, weak, failing,
unavailable`. An accepted gap stays visible but stops counting as an **open** gap;
accepting the category that drives the check's status (`missing` / `manual-only` /
`weak`) also lifts its quality/coverage score, while accepting a state category
(`stale`/`deferred`/`unavailable`/`failing`) is count-only. It never
changes evidence confidence. Like the gates, it is **human-gated**: the agent may
*propose* "accept this as tolerated risk" but must never write `accepted_gaps` for
the owner. Remove the category to un-accept.

`structure_provenance` is **gate 1** and `checks_reviewed` **gate 4** of the four
ratification gates that feed structure confidence; the feature-level gates — feature
`status` and `priority_provenance` in `project-map.yaml`—are owned by
`map-project`, and the engine joins all four. See
[`independence.md`](../_shared/independence.md) →
"Structure confidence: the ratification gates".

## Runtime Join Contract

The canonical interface between feature quality maps and observations.
`improve` makes proof producers emit the canonical observation format and
configures sources that locate it; evidence authored here must honor it:

- `evidence.path` is the canonical proof-source identity. Prefer stable
  repo-relative paths aligned with emitted artifact paths.
- `evidence.test_case` is an optional pin within that path. Matching is
  whitespace-trimmed and case-insensitive.
- A pin is the exact identity emitted by the configured reporter/converter, not
  a shortened `describe`, `it`, method, or display label. Derive it from a real
  native report converted to canonical observations whenever that producer is
  available. If the exact identity cannot be verified, do not invent a pin.
- This requirement applies to every evidence type, including `manual`, `smoke`,
  and `agent`: a checklist section, workflow step, or scenario title remains a
  documentation pointer until a canonical observation actually emits it. Put
  the readable pointer in `notes` or `command`; do not copy it into `test_case`.
- Evidence without `test_case` is file-level and matches any observed test case
  for the same path; evidence with `test_case` matches only that test case.
- Do not mix pinned and unpinned rows for the same path anywhere in the project.
  Search every quality map, not only the feature being edited.
- Canonical observation records populate the observed side with `path` plus
  optional `test_case`. The producer converts native reports before upload.

## Smoke And Health Checks As Evidence

Many release gates are smoke/health checks that run in CI but are not test files.
They are valid runtime evidence. Author the map side: set `path` to the workflow
file that wires the gate. Add `test_case` only when an existing canonical
observation proves the exact emitted identity, or when `improve` configures that
identity at the producer boundary in the same change. A workflow job/step label
or manual-check heading is never sufficient by itself. When no
canonical observation exists yet, keep the evidence file-level, record the
missing runtime backing as a `proof_gap`—a legitimate gap, not an error—and hand
the producer emit step and observation source to `improve`. Do not record run
outcomes in the map.

## User-facing check writing

Readers may present `title`, `description`, `proof_gap.summary`, and
`proof_gap.next_step` directly, so write them as user-facing summaries.
Use the schema; do not add free-form keys.

- `title`: name the project behavior or quality promise the check proves—not a
  command, artifact, or test file.
- `description`: explain what the check proves and which feature behavior or
  release confidence it affects.
- `proof_gap.summary`: describe only the structural proof gap or current
  limitation. Put run history in observation artifacts.
- `proof_gap.next_step`: the highest-value proof to add next, or omit `proof_gap`
  if there is no open gap.

Keep `SOURCE` accepted promises, `IMPLEMENTATION`-observed checks, and `INFERRED`
checks visibly distinct in title and description. Keep any documentation-baseline
check compact and secondary — do not let it carry the feature's coverage story.

## Workflow

1. **Resolve target.** A single feature/spec slug. If the request has no single
   target ("improve quality across the repo", "act on recommendations"), use
   `improve`.
2. **Gather inputs.** Read `test-spec.md`, `test-report.md`, the test files,
   code, CI config, and the PRD/spec for declared priorities. Record what was
   found and what was missing.
3. **Construct expectations.** Enumerate the quality checks; carry each check's
   `priority` (read, not invented — mark `UNKNOWN` if undeclared) and set
   `source_type`.
4. **Map evidence.** For each check, add evidence rows of `type` + `path`,
   confirming the type against the cited proof boundary and checking existing
   maps for conflicting classifications. Honor the Runtime Join Contract.
   For every existing or proposed `test_case`, locate and cite the canonical
   observation record containing the same `path` + `test_case`. If none exists,
   remove the pin, preserve its human-readable label in `notes` or `command`,
   and record the emission gap. A matching label in the proof source is not a
   substitute. Record `proof_gap` where proof is missing or weak.
5. **Set provenance.** Set `structure_provenance` honestly. Surface unratified,
   highest-priority checks for human ratification.
6. **Validate.** Run
   `npx --yes @shiplightai/quality-tools@^0.3.0 validate <map-path>`. It runs the
   engine's real validator—unknown-field, required-field, duplicate-id,
   source-ref, and evidence-path checks—and exits non-zero on any error
   (warnings pass). This is the source of truth for the contract, not a static
   schema copy. Print the current JSON Schema for reference:

   ```bash
   npx --yes @shiplightai/quality-tools@^0.3.0 schema
   ```

   Keep the map structural—no run outcomes or rollups.
   When a native report can be produced without changing proof semantics,
   convert a representative report to canonical observations and verify every
   new `path` + `test_case` identity against it. Remove any pin that cannot be
   supported by a canonical record; report its runtime-emission gap rather than
   claiming the map is fully connected.
7. **Optional runtime hand-off.** When the user wants runtime results connected,
   use `improve` for `.quality/config/*`, then `assess`. This command contributes
   the map side: evidence `path`/`test_case` and proof gaps.

## Artifact Skeletons

| Artifact | Template | Validate |
| --- | --- | --- |
| `.quality/evidence/<target>/quality-map.yaml` | `assets/quality-map.template.yaml` | `npx --yes @shiplightai/quality-tools@^0.3.0 validate <map>` (`… schema` prints the contract) |

Map-side vocabularies and ownership live in
`_shared/vocabularies.md`. For `test-spec.md` / `test-report.md` see `/shiplight
cover`; for `.quality/config/*` see `improve`.

## Operating Rules

- Constructs and edits `.quality/evidence/**` only (`improve` may also apply
  contract-conformant join-key/`proof_gap` fixes there).
  Does not create tests,
  author `test-spec.md`/`test-report.md` (dev-owned, in `specs/<feature>/`),
  author `.quality/project-map.yaml`, or touch the rest of
  `.quality/**` (config and generated output, owned by `improve` and the engine).
- Never author `depth`, `reliability`, a risk weight, or a `HIGH/MEDIUM/LOW`
  verdict; `priority` and evidence `type` are read/confirmed facts (see Inputs,
  Facts, And Independence), never invented.
- Never self-promote `structure_provenance`; ratification is human-gated.
- Keep `quality-map.yaml` structural: preserve ids, use schema enums, no run
  state, timestamps, freshness, or confidence rollups.
- Never report pass/fail without command output or an auditable observation.

## When Not To Use

- When the user wants tests created or a testing strategy chosen: use
  `/shiplight cover`.
- When the user wants project-wide improvement, runtime wiring, observation
  sets, saved views, or recommendation-driven work: use `improve`.
- When the user wants the current scores refreshed without source changes: use
  `assess`.
- When the user wants project orchestration or a project map: use
  the relevant development workflow (dev) or `map-project` (quality graph).
- When the user only wants a code review with no index construction.
