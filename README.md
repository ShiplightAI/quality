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

## Repository status

This repository is being extracted from the Shiplight monorepo. The initial
goal is to preserve the existing map contract and scoring behavior while moving
the engine, CLI, agent skill, and shared UI into one independently releasable
project.

The first usable local workflow will be:

```bash
npx @shiplightai/quality-tools analyze .
npx @shiplightai/quality-tools ui .
```

The `ui` command is planned; it is not available yet.

## Repository layout

```text
agent-skills/
  quality/           Agent workflow for constructing and maintaining quality maps
apps/
  explorer/          Local, read-only Quality Explorer web application
packages/
  quality-map/       Map schema, parser, validator, normalization, and diagnostics
  core/              Deterministic analysis, observations, recommendations, and operations
  quality-tools/     Published CLI and public programmatic API
  ui/                Shared React presentation used by local and hosted applications
docs/                 Architecture and contributor documentation
examples/             Example `.quality/` projects
tests/                Cross-package contract and integration tests
```

## Architecture

The dependency direction is deliberate:

```text
agent skill ─┐
explorer UI ─┼──> quality-tools / core ───> quality-map
hosted UI  ──┘

evidence producers ───> evidence artifacts ───> Quality
```

Quality consumes and evaluates evidence. It does not own the test runners,
telemetry systems, or other tools that produce that evidence. The deterministic
engine computes scores; an LLM never invents or adjusts them. Human-only
ratification fields remain human-controlled.

The local Explorer reads a project from the filesystem. Shiplight Quality
Center is the managed counterpart and supplies authentication, organizations,
GitHub connectivity, and hosted project access through a separate adapter.

See [docs/architecture.md](docs/architecture.md) for the package boundaries.

## Development

Requirements:

- Node.js 24 or newer
- pnpm 11

Install dependencies after the source packages have been migrated:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## License

MIT. See [LICENSE](LICENSE).
