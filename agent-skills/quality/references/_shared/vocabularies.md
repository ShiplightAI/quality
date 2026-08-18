# Shared: Quality Vocabularies

The vocabularies used across `/quality` when constructing `quality-map.yaml` and
reading runtime analysis. The runtime-analysis vocabularies are owned by the tooling and are
never authored into hand-written artifacts.

`quality-map.yaml` evidence rows carry **no authored strength vocabulary**. A
verification method is a `type` at a `path` and optional `test_case`; **evidence
confidence is derived downstream from `type`**, and flakiness/staleness/pass
come from runtime observations. There is no authored `depth` or `reliability`,
and no hand-authored `HIGH/MEDIUM/LOW` overall-confidence verdict — the verdict
is the derived evidence-confidence score beside the runtime quality score.

`source_type` (`SOURCE` / `IMPLEMENTATION` / `INFERRED`) and
`structure_provenance` (`spec` / `user_authored` / `agent_generated` /
`inferred_brownfield` / `unspecified`) are defined by `map-feature`,
since they are discussed in context with their authoring rules. `structure_provenance`
also vouches for the declared `priority` on each check.

The session/result vocabularies (test type, result status, coverage status) are
authored by `/shiplight cover` into `test-report.md`. `map-feature`
reads them when constructing the map but does not author them.

## Runtime analysis — owned by tooling, never authored

Runtime analysis output owns its own lowercase vocabularies. Do not copy them
into authored artifacts:

- Observed states: `pass`, `fail`, `error`, `skipped`, `unobserved`.
- Stage statuses: `valid`, `partial`, `invalid`.

A stage status of `partial` is **not** the report status `PARTIAL`.
