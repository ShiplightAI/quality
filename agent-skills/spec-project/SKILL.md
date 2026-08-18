---
name: spec-project
description: Drive specification-led project development from product intent through implementation and durable testing evidence. Use when an agent needs to create or refine a PRD, break a product into features, maintain accepted feature specs as current product snapshots rather than chronological change logs, reconcile a product change into existing feature specs before considering a new feature, orchestrate specification, planning, and implementation, or orchestrate /shiplight cover so it produces test-spec.md, tests, and test-report.md. Use portable Markdown by default; delegate to GitHub Spec Kit only when the repository has adopted it or the user explicitly requests it.
---

# Spec Project

Drive project work from accepted product intent to implementation and durable
testing evidence. Treat the artifacts as interfaces that keep intent,
implementation, and evidence aligned; do not treat document production itself as
the outcome.

## Delegation Contract

Own the project lifecycle and keep artifact writers explicit. Do not claim
ownership of artifacts produced by a lower-level workflow.

| Artifact | Writer and meaning |
| --- | --- |
| `docs/PRD.md` | `spec-project`: product outcomes, actors, requirements, and boundaries |
| `docs/feature-breakdown.md` | `spec-project`: numbered features, dependencies, and declared priorities |
| `specs/NNN-feature-name/spec.md` | Spec Kit in Spec Kit mode; portable coding agent otherwise: accepted product behavior |
| `specs/NNN-feature-name/plan.md` | Spec Kit in Spec Kit mode; portable coding agent otherwise: implementation approach |
| `specs/NNN-feature-name/tasks.md` | Spec Kit in Spec Kit mode; portable coding agent otherwise: executable work |
| `specs/NNN-feature-name/test-spec.md` | `/shiplight cover`: what must be verified and at what declared priority |
| `specs/NNN-feature-name/test-report.md` | `/shiplight cover`: tests, commands, and observed results |
| Tests and verification artifacts | `/shiplight cover` and its producers |

Never author or directly edit `test-spec.md`, `test-report.md`, repo-root
`TESTING.md`, or tests. Orchestrate `/shiplight cover` to create or refresh its
artifacts.

## Authority and Drift

- Treat `spec.md` as the product-behavior authority in both operating modes.
- Treat code as an implementation of the product spec.
- Treat `test-spec.md`, tests, reports, verification, and reviews as evidence
  artifacts, not substitutes for product intent.
- Keep every `spec.md` as the latest accepted product snapshot, never a
  chronological change log. A reader must be able to determine all current
  behavior without reconstructing it from amendments, tickets, release notes,
  or git history.
- When accepted intent changes, rewrite the affected requirements, scenarios,
  constraints, and non-goals in place. Remove superseded behavior instead of
  appending dated updates or descriptions of what the feature used to do.
- Let git preserve the spec's history. Put migration history in plans or
  release notes only when it is operationally necessary, not in the current
  product spec.

When behavior changes, have the active feature-spec writer reconcile the whole
`spec.md` into that current snapshot and obtain acceptance before changing the
implementation. Do not satisfy this gate by appending the change request to the
old spec. Then delegate implementation through the active mode and ask
`/shiplight cover` to reconcile its testing contract and evidence. If product
intent is ambiguous or artifacts conflict materially, stop and ask the owner;
never silently choose product semantics.

## Resolve the Operating Mode

Use one specification workflow for every project and vary only the mechanics:

1. **Portable mode (default):** direct the coding agent through existing
   repository conventions. When none exist, use the Markdown paths in the
   Delegation Contract and the bundled portable template. Do not create
   `.specify/`, a Spec Kit constitution, or Spec Kit pointers.
2. **Spec Kit mode:** delegate feature specification, planning, task generation,
   and implementation to Spec Kit. Use this mode only when a complete
   `.specify/` setup already exists or the user explicitly requests adoption.
   Before invoking Spec Kit commands, read
   [references/spec-kit.md](references/spec-kit.md).

If `.specify/` exists but required commands or templates are missing, report a
partial installation instead of guessing the mode or repairing it without a
request. Never make Spec Kit adoption a prerequisite for portable work.

Shiplight is optional during planning and implementation, but required to
produce `test-spec.md`, tests, and `test-report.md`. If `/shiplight cover` is not
installed when the evidence phase is requested, report that phase as
unavailable and provide the handoff; never take ownership of its files as a
fallback.

## Default Invocation

When invoked without a specific operation, perform a read-only status pass:

1. Read the current branch and working-tree state.
2. Detect portable or Spec Kit mode.
3. Read the PRD, feature breakdown, and relevant feature artifacts.
4. Report the active or inferred feature, phase, artifacts found, drift, and
   next gate. Treat chronological amendments or retained superseded behavior in
   `spec.md` as specification drift.

Do not create files, change pointers or branches, or run long suites during a
status pass.

## Reconcile Before Creating

Treat every incoming product change as an existing-feature change until the
repository evidence shows otherwise. Before assigning a feature ID, creating a feature
directory, or invoking a new-feature Spec Kit workflow:

1. Read the PRD and feature breakdown. Inventory every existing
   `specs/*/spec.md` and inspect each feature's name, outcome, actors, and
   boundaries. Read every plausibly related spec in full.
2. Compare the requested change with existing product capabilities by actor,
   job, workflow outcome, data responsibility, and system boundary. Do not
   classify from ticket wording, branch name, changed file count, or
   implementation size.
3. Classify as an **existing-feature retrofit (default)** when the change
   modifies, extends, replaces, or adds a scenario within an existing
   capability. Select that feature and reconcile its current spec. A missing
   requirement is not by itself a new feature.
4. If the change crosses existing capabilities, update every affected spec.
   Cross-cutting scope does not justify a new umbrella feature.
5. Classify as a **new feature (exception)** only when the change introduces a
   durable capability with its own product outcome and boundary that can be
   specified, delivered, and verified independently without distorting an
   existing feature.
6. Before creating it, report which existing features were checked and why none
   can coherently own the capability. If that conclusion requires product
   judgment, ask the owner.

Do not create a new feature ID, directory, or spec until this check is complete.
When uncertain, retrofit or ask; do not create.

## Primary Operations

### Initialize (`init`)

Create or refine `docs/PRD.md` from `assets/prd-template.md`, then create or
refine `docs/feature-breakdown.md` from
`assets/feature-breakdown-template.md`. Preserve accepted project conventions
and product terminology.

In portable mode, stop there. In Spec Kit mode, apply its constitution workflow
only as described in `references/spec-kit.md`.

### Break Down (`breakdown`)

Split the PRD into independently specifiable and verifiable product slices.
Identify actors, jobs, workflows, data domains, integrations, and risk
boundaries. Assign stable three-digit IDs, dependencies, MVP/release placement,
and a declared P0-P3 priority. Never invent priority: preserve an accepted
source or ask the owner; otherwise record `UNKNOWN`.

Before adding a roadmap entry, run the reconciliation gate against the current
breakdown and specs. Extend an existing feature entry when it already owns the
capability.

### Select (`select`)

Complete the reconciliation gate, then select an existing feature whenever it
can own the change. Resolve a new feature ID and target only after reporting why
the inspected existing features do not apply. In portable mode, let the coding
agent create the directory only after that evidence; do not create or update Spec
Kit pointers. In Spec Kit mode, invoke its new-feature workflow only after the
same gate, then let Spec Kit create the feature directory and maintain its
pointers.

Treat branch selection as separate from feature selection. Create or switch a
branch only when the user explicitly requests that branch operation, and never
strand uncommitted work.

### Drive a Feature (`lifecycle`)

Run the reconciliation gate before this lifecycle. For a retrofit, keep the
existing feature ID and reconcile its snapshot; do not fork a replacement spec.
Then run the selected feature through these gates:

1. **Specify:** in Spec Kit mode, invoke its specify workflow and let it create
   or reconcile `spec.md`. In portable mode, direct the coding agent to create
   or reconcile `spec.md` from `assets/portable-feature-spec-template.md`. Keep
   actors, behavior, acceptance scenarios, constraints, non-goals,
   dependencies, and open questions in product language. For an existing
   feature, rewrite these sections into one coherent current snapshot; never
   append the requested change as a chronological update.
2. **Clarify and accept:** use Spec Kit's clarification workflow in Spec Kit
   mode; otherwise have the coding agent surface unresolved decisions. Obtain
   owner acceptance of product intent. Treat that acceptance only as approval
   of the product spec.
3. **Plan and task:** in Spec Kit mode, delegate `plan.md` and `tasks.md` to its
   plan and tasks workflows. In portable mode, direct the coding agent through
   existing project conventions. Keep tasks traceable to accepted requirements.
4. **Plan verification:** hand the accepted spec and declared priorities to
   `/shiplight cover`. Ask it to create `test-spec.md` and tests before
   production changes when a regression-first or test-first sequence is
   practical. If it is not practical, record why and invoke it after the
   implementation exists.
5. **Implement:** delegate to Spec Kit's implementation workflow in Spec Kit
   mode and to the coding agent in portable mode. Produce the smallest complete
   implementation of the accepted scope. Ask the relevant artifact writer to
   keep spec, plan, and tasks current as implementation facts emerge; ask the
   owner before changing product semantics.
6. **Verify:** use `/shiplight verify` for relevant live UI/API behavior.
7. **Complete verification:** invoke `/shiplight cover` to refresh the testing contract,
   run the relevant verification methods, and write `test-report.md`. Optionally invoke
   `/shiplight review` when the user requests review or the accepted plan calls
   for it.
8. **Reconcile:** confirm `spec.md` states only the latest accepted behavior and
   can be understood without its history. Ask the relevant lower-level writer
   to resolve that and all other artifact drift before reporting completion;
   do not bypass its edit contract.

### Retrofit Existing Features (`maintenance`)

Use this operation for all existing-capability changes, not only bugs and
refactors. Identify the precise current behavior and every affected feature.
Update accepted specs as current snapshots when product intent changes; remove
replaced behavior rather than appending a history entry. For bugs, establish
the root cause from concrete evidence, add a regression test through the
appropriate producer when practical, and make the smallest fix. Run targeted
verification and `/shiplight cover` for the affected scope.

Do not create a feature ID or feature branch for routine maintenance.

### Batch and Autonomous Work

Use `batch` only to orchestrate preparation of multiple feature specs and plans
with the owner available; do not implement multiple features concurrently. Use
`autonomous` only for accepted specs whose plans and tasks contain no unresolved
product decisions. Work in dependency order and stop on ambiguity, missing
prerequisite work, or a verification decision requiring owner judgment.

## Completion States

Report each state separately:

- **Specification complete:** product intent is accepted; `spec.md` is a
  coherent latest product snapshot with no superseded behavior or chronological
  amendments; and `plan.md` and `tasks.md` are reconciled to it.
- **Implementation complete:** code implements the accepted scope and relevant
  implementation checks pass.
- **Evidence complete:** `/shiplight cover` produced a reconciled
  `test-spec.md`, relevant verification methods passed, and `test-report.md`
  records the run.

For a full lifecycle request, do not report the feature done until all three
states are complete. Report unavailable tooling, blocked checks, and residual
risks explicitly rather than weakening the completion criteria.

## Mutation Boundaries

- Keep status passes read-only.
- Let `init` and `breakdown` edit only the PRD and feature breakdown.
- Require the reconciliation gate before `breakdown` adds a feature or `select`
  creates an ID, directory, pointer, or branch. Let `select` delegate authorized
  changes to the active mode.
- Let `lifecycle` and `maintenance` orchestrate the active feature workflow and
  `/shiplight cover`; do not bypass their artifact edit contracts.
- Require explicit requests for branch, commit, release, PR, merge, and Spec Kit
  installation operations.
- Preserve unrelated changes in a dirty working tree.

## Route Narrow Requests

- Route test creation, coverage assessment, or `test-spec.md` changes to
  `/shiplight cover`.
- Route browser/live verification only to `/shiplight verify`.
- Route code or product review only to `/shiplight review`.

## Output

Report mode, operation, active feature, branch, phase, artifacts changed,
verification performed, completion states, and the next gate.
