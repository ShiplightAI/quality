# map-project — Map the project to reusable features

`map-project` constructs or reconciles the first layer of the quality graph:

```text
project → features → dependencies
```

It writes `.quality/project-map.yaml`. It does not define a feature's quality
checks or proof; that is `map-feature`.

## Contents

- Outcome and boundaries
- Construction sources
- Mapping workflow
- Source types, drift, and structure gates
- Report and command routing

## Read first

- [independence](../_shared/independence.md)
- [layout](../_shared/layout.md)
- [project-map contract](project-map.md)
- [brownfield reconstruction](brownfield-reconstruction.md) when accepted
  project structure is absent

## Outcome

Produce a user-facing map that lets a reader answer:

- What project boundary is being judged?
- Which reusable features make up that project?
- Which features and priorities are accepted intent versus agent
  proposals?
- Where are each feature's spec, implementation, proof report, and quality map?

Use `assets/project-map.template.yaml` as the source of truth for shape.
Define reusable feature subsets in `.quality/config/views.yaml`, not in a
parallel project-map grouping.

## Boundaries

`map-project` reads development artifacts and maps them; it does not:

- write a PRD, feature spec, plan, or tasks
- drive development or switch branches
- create tests or choose testing strategy
- construct per-feature checks/proof
- connect runtime observations or compute scores

Use the relevant development workflow for intent/spec work, a proof producer
for test creation, `map-feature` for one feature's checks/proof, and `assess` for
scores.

## Choose the construction source

### Spec-driven

Use accepted PRDs, roadmaps, feature breakdowns, specs, and explicit user
decisions as intended project behavior. Record their facts as `SOURCE`.

The existence of a file named `spec.md` is not enough. It must be an accepted
statement of intended behavior rather than a reconstruction draft.

### Brownfield

When accepted feature structure is missing, follow
`brownfield-reconstruction.md`. Code is observed behavior, not automatically
intended project behavior:

- propose feature boundaries as `candidate`
- use `IMPLEMENTATION`, `INFERRED`, or `LEGACY` honestly
- keep `priority_provenance: agent` for guessed priorities
- ask the user to confirm the feature boundaries and priorities

### Partial graph

Reconcile rather than rebuild:

- preserve stable ids
- preserve human-set priority and ratification fields
- add missing intent links
- surface conflicts and drift
- never replace accepted structure with a fresh inference pass
- remove graph-owned roadmap/milestone/grouping fields; use views for reusable
  assessment scopes and retain roadmap documents under `product_docs`

## Workflow

1. **Inventory**
   - Read existing `.quality/project-map.yaml`.
   - Read `.quality/config/sources.yaml` when present. The author, or their
     coding agent, records product sources the repository scan cannot reach
     there — a Jira project, a Linear team, an external design doc. Treat a
     `current` entry as a real intent source, follow it where the tooling allows,
     and index it in `product_docs`. Skip `rejected` entries and prefer the
     replacement named by `superseded_by`.
   - Read accepted intent sources and the user-named scope.
   - Inspect only the code, routes, schemas, tests, CI, and trackers needed to
     confirm feature boundaries.
   - Identify existing feature ids and artifact paths.

2. **Describe the proposed graph**
   - State the project boundary in user-facing language.
   - Define features as independently checkable capabilities, not filesystem
     directories, packages, or temporary changes.
   - Give each feature a stable id, promise, lifecycle status, priority,
     dependencies, source type, artifact paths, code refs, proof refs, open
     questions, and residual risks.
   - Record cross-feature concerns explicitly.

3. **Handle change classification**
   - New independently specifiable capability: add a feature.
   - Cross-cutting change: connect the affected existing feature ids; do not
     create a synthetic feature merely to represent a change.

4. **Apply safe defaults**
   - Agent-proposed brownfield feature: `status: candidate`.
   - Agent-guessed priority: `priority_provenance: agent`.
   - Do not convert non-`SOURCE` facts to `SOURCE`.

5. **Write or reconcile the map**
   - Keep the canonical file at `.quality/project-map.yaml`.
   - Keep `active_feature` as current work state, not durable project structure.
   - Link each feature to
     `.quality/evidence/<feature>/quality-map.yaml`; do not create a project-wide
     quality map.

6. **Check graph integrity**
   - feature ids are unique and stable
   - dependency ids resolve to features
   - `active_feature.id`, when present, resolves to a feature
   - artifact paths use the same target slug
   - human-set fields were preserved

7. **Present the project-level human gates**
   - Ask the owner to accept, split, merge, rename, defer, or reject candidate
     features.
   - When the owner confirms a feature, assign its accurate lifecycle status,
     such as `planned`, `specified`, or `implemented`.
   - Set `priority_provenance: human` only when a human set or confirmed the
     priority.
   - Never ratify on the owner's behalf.

8. **Choose the next feature**
   - Recommend `map-feature <target>` for the highest-priority accepted or
     explicitly selected feature.

## Source types

- `SOURCE`: accepted project intent or explicit user decision
- `IMPLEMENTATION`: current behavior observed in code or runtime
- `INFERRED`: an agent-derived boundary or fact
- `LEGACY`: existing behavior preserved without current endorsement
- `DEPRECATED`: intentionally obsolete

When sources conflict, record the conflict and ask whether code should change to
the accepted intent or intent should be updated. Do not silently choose code as
truth.

## Drift to surface

- code with no feature/spec mapping
- accepted specs without implementation
- implementation behavior absent from accepted specs
- tests asserting behavior absent from accepted specs
- features with no quality map or proof
- stale reports
- unresolved cross-feature concerns

`map-project` surfaces project-level drift. The owning development workflow
resolves intent and implementation drift.

## Structure-confidence gates owned here

`map-project` owns:

- feature `status`: `candidate` remains unratified
- `priority_provenance`: `human` only after a human priority decision

`map-feature` owns `structure_provenance` and `checks_reviewed`. The engine joins
all four gates into structure confidence. Editing tests does not raise these
human-gated fields.

## Report

Report:

- construction source: spec-driven, brownfield, or partial
- project boundary and features added, changed, or preserved
- obsolete project-level feature grouping removed and any resulting saved scopes
  handed to `improve` as views
- source types and unresolved conflicts
- candidate features and agent-guessed priorities awaiting decisions
- drift and missing feature quality maps
- recommended `map-feature <target>` command

## When another command is better

- No graph exists and the user wants guided setup: `start`
- One feature needs checks/proof mapped: `map-feature`
- Existing graph needs scores refreshed: `assess`
- Current scores/gaps should be acted on: `improve`
- User only wants current state: `status`
