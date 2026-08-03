# Shared: The `.quality/` layout & ownership

All quality-graph **source** artifacts live under `.quality/` at the repo root.
The tests, reports, workflows, telemetry, and other proof they reference remain
in their owning locations. Per-artifact ownership and the edit contract:

```text
.quality/
├── project-map.yaml                         owned by `map-project` (project and features)
├── evidence/<target-slug>/quality-map.yaml  owned by `map-feature` (per-feature checks and proof)
├── config/
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
- `fix-prompts.md` and `generated/*` are written by `quality-tools` only — treat
  them as read-only.
- Quality reads, but does not author, the **producer proof** it indexes:
  `specs/<feature>/test-spec.md`, `specs/<feature>/test-report.md`, `TESTING.md`,
  and the test files themselves. The narrow exception is explicitly authorized
  workflow glue that serializes an already-determined result into canonical
  observations; it must not change how the result is determined (see
  `_shared/independence.md`).
- `<target-slug>` reuses the `specs/NNN-kebab-case` numeric prefix so artifacts
  join across the producer and Quality sides.
