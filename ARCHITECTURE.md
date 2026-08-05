# Architecture

Shiplight Quality separates the quality contract and deterministic engine from
the environments used to present or populate it.

## Packages

### `packages/quality-map`

Owns the `.quality/evidence/*/quality-map.yaml` contract: parsing, validation,
normalization, source locations, diagnostics, vocabularies, and generated JSON
Schema. It has no dependency on the scanner, UI, agent skill, or Shiplight.

### `packages/core`

Owns deterministic analysis over a project tree: project discovery, quality
assessment, observation ingestion and evaluation, saved views,
recommendations, fix prompts, and read operations.

### `packages/quality-tools`

Owns the published CLI and curated programmatic API. It bundles the internal
contract and engine packages so users install one npm package without workspace
dependency leakage.

### `packages/ui`

Planned home for reusable React/Mantine presentation extracted from Quality
Explorer. It will receive data and capabilities through an injected client
interface.

## Applications

### `apps/explorer`

The local, read-only web application. It fixes the project root at process
startup, exposes only the read and observation operations needed by the UI, and
binds to the loopback interface by default.

## Agent skills

`agent-skills/quality` owns the agent workflow for project maps, evidence maps,
analysis, and gap triage. It invokes the installed `quality-tools` version for
validation and scoring so the authoring and runtime contracts cannot drift.

`agent-skills/spec-project` is the lower-level producer orchestrator above Spec
Kit and Shiplight. It owns the PRD, feature breakdown, and project lifecycle;
Spec Kit owns `spec.md`, `plan.md`, `tasks.md`, and its implementation workflow
when that mode is active. In portable mode, the coding agent writes equivalent
Markdown under `spec-project` orchestration. `/shiplight cover` owns
`test-spec.md`, tests, and `test-report.md`. Quality may consume those outputs,
but `spec-project` has no awareness of Quality and no dependency on the
deterministic engine.

## Non-negotiable boundaries

1. Evidence producers do not depend on Quality.
2. The deterministic engine, not an LLM, computes scores.
3. The UI is read-only; repository authoring happens through normal code-review
   workflows and the agent skills.
4. Human ratification cannot be inferred or promoted by an agent.
5. Filesystem access stays behind a data-source boundary so new sources can be
   added without changing scoring behavior.
