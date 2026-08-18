# Shared: The `.quality/` layout & ownership

All quality-graph **source** artifacts live under `.quality/` at the repo root.
The tests, reports, workflows, telemetry, and other evidence they reference remain
in their owning locations. Per-artifact ownership and the edit contract:

```text
.quality/
├── project-map.yaml                         owned by `map-project` (project and features)
├── evidence/<target-slug>/quality-map.yaml  owned by `map-feature` (per-feature checks and verification methods)
├── config/
│   ├── sources.yaml                         AUTHOR INPUT — owned by the author and their coding agent; `map-project` reads it
│   ├── observation-sources.yaml             owned by `improve`
│   ├── observation-sets.yaml                owned by `improve`
│   └── views.yaml                           owned by `improve` (saved feature scopes)
├── fix-prompts.md                           TOOL OUTPUT — read-only, never hand-edit
└── generated/
    └── recommendations/<set>--<scope>.json  TOOL OUTPUT — read-only, never hand-edit
```

Rules:

- Each command owns its own tree above and must not author another's—with one
  carve-out: `improve` may apply contract-conformant join-key
  and `proof_gap` fixes (`evidence.path`, `evidence.test_case`, `proof_gap`) to
  `evidence/**/quality-map.yaml`, following the `map-feature` contract and never
  authoring checks or structure (see the `improve` edit boundaries).
- `config/sources.yaml` is an **input**, not Quality output. The author, or their
  coding agent on request, records product sources the repository scan cannot
  reach — a Jira project or a Linear team that no file mentions, an external
  design doc — as entries carrying `key`, `kind` (`doc`, `tracker_query`,
  `external_doc`), `origin`, `status`, and an optional `label`/`note`.
  `map-project` reads it and uses those sources to enrich the project map.
  Set `origin: human` on every author-added entry, including one an agent
  types on the author's behalf. `origin` records who decided the source
  belongs here, not who wrote the line, and it defaults to `agent` when
  omitted — an `agent`-origin entry that is also `status: current` is treated
  as re-derivable from the scan and may be dropped when the file is rewritten.
  No Quality command authors this file on the author's behalf.
- `fix-prompts.md` and `generated/*` are written by `quality-tools` only — treat
  them as read-only.
- Quality reads, but does not author, the **producer evidence** it indexes:
  `specs/<feature>/test-spec.md`, `specs/<feature>/test-report.md`, `TESTING.md`,
  and the test files themselves. The narrow exception is explicitly authorized
  workflow glue that serializes an already-determined result into canonical
  observations; it must not change how the result is determined (see
  `_shared/independence.md`).
- `<target-slug>` reuses the `specs/NNN-kebab-case` numeric prefix so artifacts
  join across the producer and Quality sides.
