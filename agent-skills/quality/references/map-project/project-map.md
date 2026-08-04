# Project Map Reference

Use the project map as the root of one quality project. It connects accepted
intent, reusable features, implementation artifacts, and proof references. It is
an index and traceability graph, not a replacement for PRDs, specs, policies,
tasks, code, feature quality maps, or saved assessment scopes.

## Contents

- Formal boundary and location
- Source hierarchy
- Active feature and schema
- Saved assessment scopes
- Feature semantics and statuses
- Source types and drift

## Formal boundary and location

Keep exactly one quality project at the repository root:

```text
.quality/project-map.yaml
```

Use:

- **repository** for the filesystem boundary
- **project** for the governance and assessment boundary represented by this map
- **feature** for a reusable, independently checkable capability
- **product** only as optional descriptive language for what the project delivers

A project may represent one marketed product, several packages, or a suite of
services. Those labels do not change the graph. Do not add a formal product or
another grouping layer unless the schema later defines one.

## Source hierarchy

Maintain this authority model:

```text
accepted PRD / roadmap / user decision: project intent
.quality/project-map.yaml: project and feature graph
TESTING.md: proof-strategy guidance (development-owned)
spec.md: accepted feature behavior
plan.md / tasks.md: execution contract
code: implementation artifact
tests / reports / reviews: proof
```

Specs are current snapshots of accepted behavior, not changelogs. Git records
history. When newer behavior replaces older behavior, remove it from the active
spec and optionally mark the old feature `deprecated` or `superseded` in the
project map.

## Active feature

`active_feature` is current working state, not durable project structure. It
answers:

```text
Which feature should project-level and development commands operate on now?
```

It carries `id`, `branch`, `spec_path`, `phase`, and `updated_at`. Keep these
aligned with current branch and development pointers when those mechanisms
exist. Durable lifecycle state belongs on `features[*].status`.

## Suggested schema

Use `assets/project-map.template.yaml` for new maps. Keep fields stable and add
project-specific fields only when they have a clear consumer.

Important fields:

- `project`: identity, user-facing purpose, assessment boundary, source refs,
  and proof-policy path
- `product_docs`: accepted requirements, feature catalogs, architecture docs,
  roadmaps, and other intent sources
- `feature_order`: top-level display order for the project index; ordering only,
  with no roadmap, milestone, or release meaning
- `active_feature`: current working pointer
- `features`: reusable feature graph with dependencies and artifact links
- `cross_feature_concerns`: shared risks, constraints, and architecture seams
- `discovery`: brownfield inference and drift metadata

Do not put roadmap, milestone, or release grouping inside the quality graph.
There is no `roadmap:` block: keep those documents under `product_docs` and
store reusable assessment scopes in `.quality/config/views.yaml`. The one thing
the graph keeps is `feature_order`, and it orders the index without implying a
plan.

## Saved assessment scopes

A view is a named filter over exact `features[].id` values:

```yaml
views:
  - id: "cli"
    name: "CLI"
    description: "Shared engine and CLI assessed together."
    feature_ids:
      - "001-engine"
      - "002-cli"
```

Views may overlap when independently releasable scopes share features. Whole
project is always available without a view. A view does not copy feature data,
change scoring, select runtime sources, or represent a build.

Keep the distinctions explicit:

- view: which features are included
- observation set: which runtime-result sources are used
- release candidate: which concrete build/version/revision the observations
  cover

`map-project` owns feature ids. `improve` owns `views.yaml`.

## Feature entry semantics

Include:

- stable `id`, `name`, `status`, and `priority`
- `description` explaining the user-facing feature promise or workflow
- `source_type`
- `dependencies`
- links to accepted intent, spec, plan, tasks, and checklists
- code references owned or primarily touched by the feature
- quality-map and proof-report paths
- open questions and residual risks

A feature should be independently specifiable and checkable. Do not create one
feature per file, package, ticket, or temporary change. Keep references concise;
do not paste whole specs into the map.

## Status values

Recommended feature statuses:

- `candidate`: proposed but not human-ratified
- `planned`: accepted future capability
- `specified`: accepted spec exists and requirements are mostly clear
- `designed`: plan/contracts/data model exist
- `tasked`: implementation tasks exist
- `implementing`: code work in progress
- `implemented`: code complete for accepted scope
- `verified`: relevant proof has passed
- `reviewed`: code review completed without blocking findings
- `done`: feature accepted for the current project scope
- `blocked`: cannot progress without user or external state
- `deferred`: intentionally postponed
- `deprecated`: obsolete and retained only for history

Recommended active-feature phases:

- `specify`
- `clarify`
- `plan`
- `tasks`
- `implement`
- `/shiplight verify`
- `map-feature`
- `assess`
- `improve`
- `code-review`
- `release`

## Source types

- `SOURCE`: accepted intent or explicit user decision
- `IMPLEMENTATION`: current code or runtime behavior
- `INFERRED`: agent-derived boundary or fact
- `LEGACY`: existing behavior that lacks current endorsement
- `DEPRECATED`: intentionally obsolete behavior

Never convert non-`SOURCE` facts to `SOURCE` without a user decision or accepted
intent document.

## Drift and gap tracking

Surface:

- code with no feature/spec mapping
- accepted specs with no implementation
- implementation behavior missing from accepted specs
- tests asserting behavior absent from accepted specs
- features with no quality map or proof
- stale proof reports
- changed code without updated specs
- unresolved cross-feature concerns

When implementation and accepted intent conflict, ask whether the implementation
should change or the intent should be revised. Do not silently choose code as
truth.
