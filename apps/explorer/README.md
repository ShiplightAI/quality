# Quality Explorer

Local, read-only web UI for a repository's `.quality/` backbone.

During development, select the repository at process startup:

```bash
QUALITY_PROJECT_ROOT=/absolute/path/to/project pnpm --filter @shiplightai/quality-explorer dev
```

The server binds to `127.0.0.1:4173`. API handlers ignore client-supplied project
paths and always operate on `QUALITY_PROJECT_ROOT`. Repository authoring remains
the responsibility of the `quality` agent skill and normal code review.

The current component source lives in the application while standalone parity
is established. Reusable presentation will move incrementally into
`packages/ui`.
