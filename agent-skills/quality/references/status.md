# status — Read the current quality posture

`status` is read-only. It may use repository-inspection tools, but it does not
edit files, execute verification methods, invoke `quality-tools`, or refresh
generated results.

## Read first

- [independence](_shared/independence.md)
- [layout](_shared/layout.md)

## Workflow

1. Inventory:
   - `.quality/project-map.yaml`
   - `.quality/evidence/**/quality-map.yaml`
   - `.quality/config/*`
   - recent `.quality/generated/**` results
   - referenced recent test reports when needed to explain staleness
2. Describe the graph in user-facing project language:
   - features represented and missing
   - checks and verification methods connected for the requested scope
   - views available and the feature ids each selects
   - observation sources and sets available
   - unresolved graph edges, drift, or human gates
3. Report scores only from identifiable engine output. Include its project,
   whole-project or view scope, observation set, and observed revision/run. If
   results are missing or stale, say so.
4. Recommend exactly one next command:
   - `start` when no usable graph exists
   - `map-project` when project/feature structure is missing or stale
   - `map-feature <target>` when one feature lacks trustworthy checks or
     verification methods
   - `assess` when the graph is ready but scores need refreshing
   - `improve` when a current assessment identifies actionable gaps
5. Present the command menu.

Never infer a score from YAML, test counts, or prose reports.
