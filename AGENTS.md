# Repository guidance

## Independence

Quality evaluates evidence independently of the systems that produce it.

- Evidence producers write facts and artifacts; they do not write `.quality/`.
- Quality reads and evaluates evidence; it does not create tests or modify
  producer artifacts.
- Scores are computed by the deterministic engine, never by an agent or UI.
- Agents must not set human ratification fields or accept risk for a human.

## Dependency direction

- `packages/quality-map` is the lowest-level contract package.
- `packages/core` may depend on `packages/quality-map`.
- `packages/quality-tools` may bundle and expose curated APIs from both.
- `packages/ui` consumes public read models and must not import filesystem,
  GitHub, authentication, or Shiplight platform code.
- `apps/explorer` supplies the local filesystem adapter and application shell.
- `agent-skills/quality` consumes the published CLI contract.

Do not introduce dependencies from the engine into evidence producers or from
open-source packages into the Shiplight platform monorepo.

## Extraction discipline

During migration, preserve behavior before reorganizing it. Move regression
and contract tests with their implementation, then verify parity against the
source monorepo before deleting the original copy.
