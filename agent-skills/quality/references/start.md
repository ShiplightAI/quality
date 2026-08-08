# start — Bootstrap the quality project graph

Use `start` when a repository has no usable quality project graph or only a
partial one.
The outcome is the smallest honest graph for the highest-priority feature scope,
plus an initial assessment when runtime observations are available.

## Contents

- Read first and explain the graph
- Classify the starting state
- Bootstrap workflow
- Completion report

## Read first

- [independence](_shared/independence.md)
- [layout](_shared/layout.md)
- [project-map contract](map-project/project-map.md)
- [brownfield reconstruction](map-project/brownfield-reconstruction.md) for a
  brownfield repository
- [map-feature](map-feature/index.md) before constructing the first feature map

## Explain the graph

Before discussing YAML, explain:

```text
project → features → quality checks → proof definitions → runtime observations
```

Then show which existing repository artifacts can supply each layer. Do not ask
the user to choose between `project-map.yaml`, `quality-map.yaml`, or observation
config before explaining their roles.

## Classify the starting state

- **Spec-driven:** accepted PRDs/specs define intended project behavior. Treat
  accepted requirements as project intent; do not infer them again from code.
- **Brownfield:** current code/tests/docs exist without accepted feature
  structure. Reconstruct candidates from implementation and ask the user to
  ratify them.
- **Partial graph:** some `.quality/` artifacts exist. Preserve stable ids and
  human-owned fields, repair only the missing or stale layers, and never replace
  the graph wholesale.

Classification controls defaults; directory names do not. A `specs/` directory
or file named `spec.md` is not acceptance by itself. Conversely, do not downgrade
features and checks that trace to accepted intent merely because an agent writes
the Quality YAML.

If intent or priority cannot be recovered from accepted documents, ask where to
start. Do not autonomously map an entire brownfield repository.

## Bootstrap workflow

1. **Inventory without mutation**
   - Read accepted intent/spec documents, `.quality/**`, proof policy such as
     `TESTING.md`, relevant code/test areas, CI workflows, and recent reports.
   - Report which graph layers exist, are missing, or conflict.

2. **Choose the first feature scope**
   - Prefer the user-named area.
   - Otherwise use the highest declared feature priority or project risk.
   - Keep the initial slice small enough to review and ratify.

3. **Map the project**
   - Follow `map-project`.
   - Create or reconcile `.quality/project-map.yaml`.
   - In brownfield work, propose `candidate` features rather than presenting
     reconstructed behavior as accepted intent.
   - In spec-driven work, use the lifecycle status supported by accepted intent
     and repository facts. An accepted feature with a spec is at least
     `specified`; use `implemented` only when implementation evidence supports
     it. Do not use `candidate` for an accepted feature boundary.

4. **Stop for the project-level human gates**
   - For brownfield candidates, a human confirms feature boundaries by moving
     `candidate` to the accurate lifecycle status.
   - An explicit priority in accepted human-authored intent is already a human
     priority decision; copy it with `priority_provenance: human`. A priority
     inferred from ordering, risk, code, or agent judgment remains `agent`.
   - Never reinterpret who copied a value as who originated the decision.

5. **Map the first feature**
   - Follow `map-feature <target>`.
   - Construct checks from accepted requirements when they exist; otherwise
     reconstruct them from implementation with honest provenance.
   - Connect existing proof by canonical path and optional test-case name.
   - Record missing or weak proof as `proof_gap`; do not create tests here.
   - Set `structure_provenance: spec` when the check list and priorities trace
     to accepted requirements. Agent authorship of the YAML does not make that
     list `agent_generated`; use per-check provenance for genuine exceptions.

6. **Stop for feature-level human gates**
   - `structure_provenance` records origin and is never rewritten merely because
     a human reviewed the map.
   - Set `checks_reviewed: true` only after a human approves the complete check
     list.
   - Never write `accepted_gaps` unless a human explicitly accepts that risk.

7. **Connect runtime when results exist**
   - Follow `improve` → "Observation configuration".
   - When producer edits are explicitly authorized, make the producer publish
     canonical `quality-observations.json`, following `improve` → "Connect an
     observation source". Otherwise, propose the exact emit/upload change and
     record the emission gap without editing the producer.
   - Add the smallest transport-only observation source and set that locate it.
   - Do not create a source profile for a workflow that emits no canonical
     observation file. Record the emission gap instead.
   - Add a view only when a reusable feature subset must be assessed
     independently. For example, Monots uses `[engine, CLI]` and `[engine, MCP]`
     as overlapping scopes.

8. **Assess**
   - Follow `assess` when an observation set can run.
   - If runtime is not connected, report the structural graph and the exact
     missing runtime edge. The quality score is unavailable; never substitute an
     estimate.

9. **Choose the next improvement**
   - Identify the weakest high-priority condition, not merely the lowest number.
   - Continue with `improve`, or map the next priority feature.

## Completion report

Report:

- starting-state classification and scope
- graph layers created, preserved, or still missing
- proposed versus human-ratified structure
- first feature mapped and proof gaps found
- saved assessment scopes created, when any
- whether runtime assessment was possible
- all four engine-produced scores, when available
- the next command and why it is next
