# Contributing

## Getting set up

You need Node.js 24 or newer and pnpm 11.

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

All four must pass before a change is ready. `pnpm build` first is not optional:
the packages depend on each other's built output, so on a fresh clone both
`typecheck` and `test` fail without it.

## What lives where

| Folder | What it holds |
| --- | --- |
| `packages/quality-map` | The file format: reading, checking, and describing it |
| `packages/core` | The engine that works everything out |
| `packages/quality-tools` | The published command line tool and API |
| `packages/ui` | Shared screens |
| `apps/explorer` | The local browser view |
| `agent-skills/` | The instructions agents follow |
| `docs/` | These docs |
| `tests/` | Tests that cross package boundaries |

Which package may depend on which is not a style preference — it is what keeps
the tool usable outside this repository. See [architecture](ARCHITECTURE.md).

## Working on the agent skills

`agent-skills/` is the real source. The copies that appear inside a project when
someone installs a skill are generated, and should never be edited directly.

CI checks the skills for a number of things, including that command examples pin
a compatible version. Run the checks yourself:

```bash
scripts/check-quality-skill.sh
```

## Docs and skills are different jobs

Worth understanding before writing either:

- **`docs/` is a user manual.** It is for a person, and it explains what they can
  ask for and how to ask. It deliberately contains almost no field-level detail.
- **`agent-skills/` is a program.** It is for an agent, and it specifies exactly
  how to do the work correctly.

If the same field rules appear in both, they will disagree within a release or
two. When you need to document a format, put it with the skill and link to it
from the docs.

## Tests

| Kind | What belongs there |
| --- | --- |
| `tests/unit` | One function, no filesystem |
| `tests/contract` | A promise the code makes to its callers, including across packages |
| `tests/integration` | Several parts together, usually with real files |

Two habits this codebase relies on:

**Write the failing test first.** Every fix should start with a test that fails
for the right reason, so you know it covers what you think it covers.

**Test the silence, not just the success.** The worst failures in this tool are
quiet ones — a result that fails to connect, a value that is dropped rather than
rejected. A test showing that something works often will not catch those. A test
showing that the tool *complains* when something is wrong usually will.

## Releasing

The packages are published to npm and versioned independently. Two things to
check before publishing:

- If you removed or renamed anything a consumer could import, the version must
  say so.
- If you changed how the command line tool behaves, the agent skill pins `^0.3.0`
  and CI checks that pin — so a version bump outside that range needs the skill
  updated in the same change.
