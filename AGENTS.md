# Repository guidance

## Independence

Quality evaluates evidence independently of the systems that produce it.

- Evidence producers write facts and artifacts; they do not write `.quality/`.
- Quality reads and evaluates evidence; it does not create tests or modify
  producer artifacts.
- Scores are computed by the deterministic engine, never by an agent or UI.
- Agents must not set human validation fields or accept risk for a human.

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

## Version bumps

Bump the **patch** version by default: if `0.3.0` is published, the next release
is `0.3.1`. This holds even when the release adds API. Use a minor or major only
when the maintainer says so for that release.

Count from the **published** version, never from what `package.json` currently
says. Between releases the manifest sits on the last published number with
unreleased work on top, so it is not the base — and a number that was set in the
repo but never published (`quality-core` `0.2.0`) is a dead end that nothing
counts from. Read the base with `npm view @shiplightai/<package> version`.

A bump moves the size approval with it: `approvedIncrease.version` in
`packages/quality-tools/package-size.json` must equal the new `package.json`
version, or the gate rejects the recorded approval and the build fails.

## Publishing

Releases go out through the **Publish packages** workflow
(`.github/workflows/publish.yml`), run manually from the Actions tab against
`main`. npm authenticates it by OIDC (trusted publishing), so this repository
holds no npm token and a maintainer's 2FA never enters the loop. Each package
carries a trusted publisher on npmjs.com naming `ShiplightAI/quality` and that
workflow file; renaming the file breaks publishing until the npm side is
updated to match.

The workflow does not decide versions. It publishes exactly what `package.json`
says on `main` and skips any package already at that version on npm, so the
release is whatever the reviewed `chore: release` commit landed. This is
deliberate: a workflow that bumped versions itself would move
`approvedIncrease.version` away from the number a human approved.

Publishing by hand is the fallback, not the path. It needs a long-lived npm
token or an interactive 2FA prompt, and it publishes a working tree rather than
a reviewed commit.

## Release size gate

The `quality-tools` release artifact may grow by at most 1% in both packed and
unpacked size relative to the current published npm version. A larger increase
requires a human maintainer to add an exact, version-specific
`approvedIncrease`, including their name and reason, to
`packages/quality-tools/package-size.json`. Agents must not add, modify, or
claim this approval on a human's behalf.

## Extraction discipline

During migration, preserve behavior before reorganizing it. Move regression
and contract tests with their implementation, then verify parity against the
source monorepo before deleting the original copy.
