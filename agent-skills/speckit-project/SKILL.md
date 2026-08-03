---
name: speckit-project
description: Drive spec-driven (or spec-less) project development. Create and refine the PRD and feature breakdown, classify incoming work (new feature vs cross-cutting change), select the active feature, and run the feature lifecycle — specify, clarify, plan, tasks, analyze, implement — sequencing test creation, verification, and code review. It produces docs/PRD.md, docs/feature-breakdown.md, and specs/<feature>/ artifacts, and hands test creation to /shiplight cover.
---

# Speckit Project

Project-level operating workflow for driving development. Use this to create or
refine a PRD, break a product into numbered features, select or switch the
active feature, and run a feature from intent through implementation, sequencing
the development skills.

It produces human-readable Markdown and Spec Kit artifacts and drives
implementation. It sequences sibling skills rather than duplicating them:
`/shiplight verify` (browser/live behavior), `/shiplight cover` (test creation), and the test producers `/shiplight create-yaml-tests` / `/shiplight create-agent-verification`.

## What This Skill Owns

- `docs/PRD.md` — product requirements and intent.
- `docs/feature-breakdown.md` — numbered roadmap and feature dependencies.
- `specs/NNN-feature-name/` — Spec Kit feature artifacts (`spec.md`, `plan.md`,
  `tasks.md`) when Spec Kit is adopted.
- The active-feature dev pointers: the git branch, `.specify/feature.json`, and
  the `AGENTS.md` Spec Kit pointer.

## Prerequisites

Spec-driven work needs Spec Kit installed and bootstrapped (`specify` CLI, the
repo run through `specify init` for the active agent) plus the Shiplight MCP and
skills. Reference: https://github.com/github/spec-kit/blob/main/README.md

These gate **Spec-Kit-specific** steps only. **Spec-less development** — building
or fixing without Spec Kit, driving implementation directly and handing the
result to `/shiplight cover` — is a first-class path that needs no `specify init`. Most existing repos never adopt Spec Kit. If a
Spec-Kit-specific step is requested while Spec Kit is missing, stop and either
help install it or offer the spec-less path.

## Default Invocation

When invoked without a specific request, run a non-mutating status pass: read the
branch, the active-feature pointers, the PRD/feature-breakdown, and the active
feature's spec/plan/tasks, then report current mode, active feature, branch,
phase, artifacts found, and the next gate. Do not create files, switch branches,
or run long suites unless asked.

## Specification Authority

- Specs are the source of truth for accepted product behavior.
- Code is an implementation artifact of the specs.
- Tests, verification reports, and reviews are evidence.
- Specs are current snapshots, not historical logs; git tracks history.

When behavior changes, update the relevant spec in the same change. If code,
tests, plans, or docs drift from the spec, reconcile before declaring the feature
done (see Drift Resolution). If intent is unclear, stop and clarify — do not
silently choose between conflicting spec/code/test behavior when product
semantics are at stake. In spec-less projects, the ratified feature intent (the
`test-spec.md` and the owner's accepted behavior) plays the spec's role.

## Change Classification

Before selecting a mode or touching a branch, classify the work. The **one
branch per feature** rule governs *new features only*.

1. **New feature** — adds a product capability or accepted behavior not yet
   specified. Apply one-branch-per-feature: create/select a feature ID, work on
   its branch, run the Feature Lifecycle. This is the only case that creates a
   new feature branch by default.
2. **Cross-cutting change** — a bug fix, refactor, or improvement touching
   *existing* features without a new capability. Do **not** auto-create a new
   feature or branch. Default to **Maintenance** (retrofit existing features on
   the repo's normal change branch). Only **promote to a new feature** when the
   change is substantial enough to stand as its own capability.

A single cross-cutting change may touch several features — scope it, list the
affected features, reconcile their specs and tests together.

## Primary Artifacts

Prefer existing repo conventions. Otherwise: `docs/PRD.md`,
`docs/feature-breakdown.md`, `specs/NNN-feature-name/`. Use the bundled
`assets/prd-template.md` and `assets/feature-breakdown-template.md`. `specs/` is
a plain directory convention — use it even when the project is not spec-driven,
so `/shiplight cover` finds artifacts in one place.

Write PRD, roadmap, and feature names/descriptions in product language —
capabilities, workflows, outcomes — not implementation detail.

## Operating Modes

Pick the family, then the mode:

- **Set intent** — `init` (PRD, feature breakdown), `breakdown` (split a PRD into
  executable slices).
- **Drive a feature** — `select` (active feature), `lifecycle` (plan + execute),
  `batch` (prepare many), `autonomous` (execute ratified plans).
- **Maintain** — `maintenance` (change existing features without adding one).

### 1. Project Initialization (`init`)

Create or refine `docs/PRD.md`, then `docs/feature-breakdown.md` (numbered
features, dependencies, MVP/release areas). Verify the project constitution
establishes specification authority; run `speckit-constitution` if missing or
weak.

### 2. Roadmap And Feature Breakdown (`breakdown`)

Convert the PRD into executable slices: identify actors, jobs, workflows, data
domains, integrations, and risk boundaries; split so each feature can be
specified, implemented, and verified independently; assign stable three-digit IDs
(`001-*`) and explicit dependencies; keep MVP/release areas visible. Carry each
feature's declared **priority** (P0–P3) — it is the importance fact that
`/shiplight cover` later reads to set testing effort.

### 3. Active Feature Selection (`select`)

Confirm the feature ID and branch; ensure only one active feature. Align the
dev pointers: git branch, `.specify/feature.json`, the `AGENTS.md` Spec Kit
pointer. If the feature does not exist, create it (Spec Kit feature flow when
adopted, or just `specs/NNN-name/` when spec-less). Report active feature,
branch, phase, and the next expected command.

### 4. Feature Lifecycle Driver (`lifecycle`)

One active feature at a time (new features; for fixes use Maintenance).

**Spec-driven planning** (Spec Kit), usually owner-present:

```text
speckit-specify -> speckit-clarify -> speckit-checklist -> speckit-plan
-> speckit-tasks -> speckit-analyze and fixes -> commit when requested
```

**Spec-less planning** (no Spec Kit): author and ratify the feature intent
directly — the `specs/<feature>/test-spec.md` and the owner's accepted behavior
stand in for the spec. The owner ratifies, exactly as Spec Kit planning is
owner-present.

**Execution** (shared by both, automatable after planning is accepted):

```text
speckit-implement (or implement directly, spec-less)
-> verify UI/API behavior as needed (`/shiplight verify`)
-> create or update tests (`/shiplight cover`)
-> optional review (`/shiplight review`)
-> commit implementation when requested
```

After execution, hand off to `/shiplight cover` for comprehensive tests and the
session record.

### 5. Batch Planning (`batch`)

With the user available, prepare many features: switch active feature, run
specify/clarify/plan/tasks/analyze, commit documents when requested. Do not
implement multiple features at once; leave each with a clear next step.

### 6. Autonomous Execution (`autonomous`)

Only for features whose planning is complete and ratified. Work in dependency
order, switch active feature before implementing, run implementation and hand to
`/shiplight cover`. Stop if requirements are ambiguous, tests need product judgment,
or a feature depends on unimplemented work.

### 7. Cross-Cutting Change / Maintenance (`maintenance`)

The retrofit path: a fix or refactor maintaining existing features on the repo's
normal change branch, no new feature entry. Identify every feature the change
touches; reconcile each through Drift Resolution (a pure bug fix usually realigns
code to the existing spec); run `/shiplight verify` and `/shiplight cover` for the
affected scope. Promote to a new feature only if the change is substantial enough
to stand alone.

## Drift Resolution

Drift is expected. Resolution order:

1. Identify the conflicting artifacts and reference the smallest useful evidence.
2. If product intent is obvious from accepted specs/PRD/constitution, update the
   drifting artifacts to match.
3. If intent is not obvious, ask the user before changing behavior.
4. After the decision, update the active spec first, then plan/tasks/code/tests.
5. Remove replaced behavior from active specs; git holds the history.

Do not report a feature as complete while known spec/code/test drift remains.

## Done Criteria

Do not report a feature as done unless: spec/tasks are reconciled, implementation
is complete for the accepted scope, and relevant tests/checks have passed (via
`/shiplight cover`) or residual risks are documented.

## Mutation Boundaries

- Status pass: read-only unless asked to fix artifacts.
- `init` / `breakdown`: create or edit PRD and feature breakdown.
- `select`: update `.specify/feature.json`, AGENTS pointers, and the branch only
  when the target feature is clear. Do not switch branches with uncommitted
  changes that could be stranded; report the conflict.
- `lifecycle` / `maintenance`: update specs before code when accepted behavior
  changes, then plan/tasks/code/tests.
- Branch, release, PR, and merge operations require an explicit user request.
- Never edit `/shiplight cover`'s artifacts (`test-spec.md`, `test-report.md`,
  repo-root `TESTING.md`).

## When Not To Use

- When the user wants tests created or coverage assessed: use `/shiplight cover`.
- When the user wants only browser/live verification: use `/shiplight verify`.
- When the user wants only a code review: use `/shiplight review`.

## Output Style

Keep project-level status explicit: current mode, active feature, branch, phase,
artifacts changed, next gate. For clarification questions, present the question
first, then options.
