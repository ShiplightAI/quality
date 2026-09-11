# Quality Explorer

Local, read-only web UI for a repository's `.quality/` backbone.

During development, select the repository at process startup:

```bash
QUALITY_PROJECT_ROOT=/absolute/path/to/project pnpm --filter @shiplightai/quality-explorer dev
```

To preview Release Intelligence against an exact GitHub Actions run, supply a
run URL (recommended) or a numeric run ID. A numeric ID infers the repository
from the project's GitHub `origin` remote:

```bash
GITHUB_TOKEN="$(gh auth token)" \
QUALITY_PROJECT_ROOT=/absolute/path/to/project \
RELEASE_ACTION_RUN=https://github.com/owner/repo/actions/runs/123 \
pnpm --filter @shiplightai/quality-explorer dev
```

The numeric-ID form is equivalent:

```bash
GITHUB_TOKEN="$(gh auth token)" \
QUALITY_PROJECT_ROOT=/Users/jinfeng/loggia/shipyard \
RELEASE_ACTION_RUN_ID=123 \
pnpm --filter @shiplightai/quality-explorer dev
```

Open <http://127.0.0.1:4173/release-intelligence>. The adapter resolves the run,
analyzes its exact commit in a temporary checkout, and removes that checkout
after rendering. It uses a detached worktree when the commit is available
locally and otherwise downloads a private, token-authenticated GitHub archive;
it does not fetch into or modify the selected repository. Optional
`RELEASE_ENVIRONMENT` values are `staging` and `production` (the default);
`RELEASE_COMPONENTS` accepts a comma-separated component list.

The server binds to `127.0.0.1:4173`. API handlers ignore client-supplied project
paths and always operate on `QUALITY_PROJECT_ROOT`. Repository authoring remains
the responsibility of the `quality` agent skill and normal code review.

The Explorer owns the server adapter and application shell. Reusable,
host-independent Release Intelligence presentation lives in `packages/ui`.
