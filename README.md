# Shiplight Quality

Open-source, evidence-backed quality maps for software.

Shiplight Quality answers two questions:

1. What must a product or feature do?
2. What independent evidence proves that it does it?

Projects keep that model in a version-controlled `.quality/` directory. The
deterministic engine reads the declared checks, their evidence, runtime
observations, and human ratification to compute four separate measures:

- quality
- coverage
- evidence confidence
- structure confidence

Tests are one evidence source among many. Manual verification, telemetry,
static analysis, CI artifacts, and other review records can all contribute when
their provenance is explicit.

## What's included

This repository contains the quality-map contract, deterministic engine, CLI,
agent skill, and Quality Explorer. Quality Explorer is the open-source,
read-only web UI for inspecting a local project's quality maps.

Analyze a project that already has a `.quality/` directory:

```bash
cd /path/to/project
npx @shiplightai/quality-tools analyze .
```

To run Quality Explorer, see [Development](#development). The `quality-tools ui`
convenience command and extraction of reusable React components into
`packages/ui` are planned; they are not available yet.

## Install the agent skills

`agent-skills/` holds two skills:

| Skill | Purpose |
| --- | --- |
| `quality` | Construct, assess, and improve a repository's quality project graph and four-score quality index. Commands: `start`, `status`, `map-project`, `map-feature`, `assess`, `improve`, `help`. |
| `speckit-project` | Drive spec-driven or spec-less project development: PRD, feature breakdown, and the specify → clarify → plan → tasks → analyze → implement lifecycle. It produces evidence rather than scoring it, and hands test creation to `/shiplight cover`. |

Install with the [`skills`](https://www.npmjs.com/package/skills) CLI, run from
the target project's root. Naming a skill installs only that one, which is what
you usually want:

```bash
npx skills add ShiplightAI/quality/agent-skills --skill quality -a claude-code -y
```

Omitting `--skill` installs **both**. Change `-a` for a different
`skills`-supported agent, or use `--all` for every agent the CLI detects:

```bash
npx skills add ShiplightAI/quality/agent-skills --skill speckit-project -a codex -y
npx skills add ShiplightAI/quality/agent-skills --all
```

To update, re-run the same command. Useful flags include `-a/--agent`,
`-s/--skill`, `-g/--global`, `--copy`, `--all`, and `-y/--yes`.

Installation writes `skills-lock.json` and an agent directory such as
`.agents/` or `.claude/` into the target project. Those are generated state —
keep them out of version control.

This repository is not public yet, so the `skills` CLI needs GitHub access to
`ShiplightAI/quality` when it clones. Both skills previously shipped from
`ShiplightAI/internal-tools/agent-skills`; projects still installing from there
should repoint at this repository.

## Repository layout

```text
agent-skills/
  quality/           Agent workflow for constructing and maintaining quality maps
  speckit-project/   Agent workflow for spec-driven project and feature development
apps/
  explorer/          Local, read-only Quality Explorer web application
packages/
  quality-map/       Map schema, parser, validator, normalization, and diagnostics
  core/              Deterministic analysis, observations, recommendations, and operations
  quality-tools/     Published CLI and public programmatic API
  ui/                Planned shared React presentation package
docs/                 Architecture and contributor documentation
examples/             Example `.quality/` projects
scripts/              Repository check scripts run by CI
tests/                Cross-package contract and integration tests
```

## Architecture

The dependency direction is deliberate:

```text
agent skill ─┐
explorer UI ─┼──> quality-tools / core ───> quality-map

evidence producers ───> evidence artifacts ───> Quality
```

Quality consumes and evaluates evidence. It does not own the test runners,
telemetry systems, or other tools that produce that evidence. The deterministic
engine computes scores; an LLM never invents or adjusts them. Human-only
ratification fields remain human-controlled.

`agent-skills/speckit-project` is the exception to that boundary, and only in
where it is stored. It is a producer-side workflow: it drives specs and
implementation and hands test creation to `/shiplight cover`. It does not read
or write quality maps, and the engine has no dependency on it. It ships from
this repository for distribution convenience, not because it is part of the
oracle. Its `/shiplight` references resolve only in projects that also have the
Shiplight skills installed.

Quality Explorer reads a project from the local filesystem and presents the
engine's results without modifying the repository.

See [docs/architecture.md](docs/architecture.md) for the package boundaries.

## Development

Requirements:

- Node.js 24 or newer
- pnpm 11

Install dependencies and run the repository gates:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

To inspect another local repository, start the Explorer with its absolute path:

```bash
QUALITY_PROJECT_ROOT=/absolute/path/to/project pnpm --filter @shiplightai/quality-explorer dev
```

Open <http://127.0.0.1:4173/quality-explorer>. The project root is fixed when the
process starts and cannot be changed by browser requests.

## License

MIT. See [LICENSE](LICENSE).
