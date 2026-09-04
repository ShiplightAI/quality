# improve — Improve the underlying quality posture and reassess

`improve` starts from an engine-produced assessment, diagnoses which underlying
condition is weak, changes that condition honestly, and runs `assess` again.
The objective is better project behavior and evidence—not a larger number.

## Contents

- Assessment contract and scope
- Improvement loop
- Observation configuration and runtime joins
- Fix prompts and edit boundaries
- Report

## Read first

- [independence](../_shared/independence.md)
- [layout](../_shared/layout.md)
- [vocabularies](../_shared/vocabularies.md)
- [map-feature](../map-feature/index.md) → "Runtime Join Contract" before
  touching a feature map

## Assessment contract

The quality graph joins structural declarations to current observations:

```text
.quality/project-map.yaml
        ↓ feature id / quality_map_path
.quality/evidence/<target>/quality-map.yaml
        ↓ evidence.path + optional evidence.test_case
evidence producer / workflow
        ↓ quality-observations.json (one canonical format)
.quality/config/observation-sources.yaml
        ↓ transport locates the canonical file
.quality/config/observation-sets.yaml
        ↓ joined within whole-project or saved-view feature scope
quality-tools analyze
        ↓
.quality/generated/recommendations/<set>--<scope>.json
```

The engine reports four separate scores:

| Score | Diagnose | Honest improvement |
| --- | --- | --- |
| Coverage | A declared check has no mapped verification method | Create an appropriate method through a producer, then map it |
| Evidence confidence | A method exists but its modality or gate is too weak for the check | Strengthen verification at the system boundary that matters |
| Quality | Evidence is failing, stale, unavailable, or unobserved | Fix the implementation or method, or repair acquisition and graph joins, then rerun |
| Structure confidence | Features, checks, or priorities are inferred or unreviewed | Ask a human to correct or validate them through `map-project` or `map-feature` |

No command may directly author a score. Never improve a number by removing
scope, weakening checks, relabeling evidence, accepting risk, or changing
provenance without the real-world event the field records.

## Scope

Resolve all assessment dimensions:

- project from `.quality/project-map.yaml`
- feature scope: whole project or one saved view from
  `.quality/config/views.yaml`
- observation set from `.quality/config/observation-sets.yaml`, when one exists;
  without it the baseline carries the three static scores and no Quality score
- observed revision/run from source artifacts, when available
- generated recommendations baseline, when named by the user

`improve` works across an existing graph. If no project map or feature quality
maps exist, use `start`. If one feature needs its checks reconstructed, use
`map-feature <target>`.

## Improvement loop

### 1. Establish the baseline

Follow `assess` and retain:

- feature scope, observation set, and observed revision/run
- generated recommendation path
- every score the run produced, and the stated reason for any that is unavailable
- acquisition and resolution diagnostics
- recommendations in priority order

Do not change anything until the low score or recommendation has been traced to
a concrete graph node, graph edge, evidence artifact, or implemented behavior.

### 2. Classify the root cause

Classify each gap before editing:

1. **Structure:** wrong/missing feature, check, priority, provenance, or human
   review.
2. **Coverage:** no verification method is mapped for a valid check.
3. **Evidence strength:** a mapped method cannot establish the full claim or lacks
   the required execution context/gate.
4. **Source acquisition:** credentials, repository/workflow selection, artifact
   names, local-folder path, or an unregistered host provider prevent results
   from loading.
5. **Artifact emission:** the workflow emits no canonical observation file or
   emits it at the wrong path.
6. **Producer format:** the canonical file has an invalid version, envelope,
   status, timestamp, revision, or duplicate observation identity.
7. **Graph join:** results load but `path`/`test_case` do not match
   `evidence.path`/`evidence.test_case`, or the match is ambiguous.
8. **Real failure:** current evidence joins correctly and reports a failing/error
   state.
9. **Scope:** the observation set contains the wrong profiles or the saved view
   contains the wrong features.

Use `runtime_review.execution_diagnostics` for acquisition or canonical-format
problems and `runtime_review.resolution_diagnostics` plus `resolution_audit` for
graph-join problems. Do not call an unobserved check a missing test until
acquisition and resolution have been ruled out.

### 3. Apply the smallest honest improvement

#### Structure confidence

- Follow `map-project` for feature boundaries, status, and priority provenance.
- Follow `map-feature` for the check list, verification methods, origin provenance,
  and whole-list review.
- Propose corrections highest priority first.
- Never flip a human gate or write `accepted_gaps` for the owner.

#### Coverage

- Confirm the check is valid before commissioning a verification method for it.
- Use existing evidence when it genuinely supports the check and map its method through
  `map-feature`.
- Otherwise hand a precise evidence gap to an appropriate producer. Quality does
  not author the test.
- Confirm the resulting artifact and type before adding it to the graph.

#### Evidence confidence

- Match method strength to the claim. Unit evidence may fully establish a small,
  deterministic code contract; it does not establish a cross-boundary user
  workflow by itself.
- Add a meaningful integration, browser, smoke, telemetry, or release-gate
  layer only when the claim requires that boundary.
- Never relabel the same artifact as a stronger type.

#### Quality

- For acquisition/config problems, repair
  `.quality/config/observation-sources.yaml`.
- For artifact-emission problems, add or repair an authorized workflow emit
  step, or propose it when workflow changes are not authorized.
- For producer-format problems, make the producer use `quality-tools
  observations`; do not add a parser choice to source configuration.
- For join problems, align emitted `path`/`test_case` with
  `evidence.path`/`evidence.test_case`. There is no second mapping table.
- For a real failure, fix the implementation or verification method through its owning workflow and
  rerun it.
- For stale/unavailable evidence, refresh it or report the external blocker.

#### Scope

- Fix observation-set profile membership or saved-view feature membership.
- Never remove a valid high-risk feature merely to improve the result.

### 4. Check the changed layer

- Schema-validate a feature map:

  ```bash
  npx --yes @shiplightai/quality-tools@^0.3.0 validate <quality-map-path>
  ```

- Current quality-map schema:

  ```bash
  npx --yes @shiplightai/quality-tools@^0.3.0 schema
  ```

- Schema-validate canonical observations:

  ```bash
  npx --yes @shiplightai/quality-tools@^0.3.0 observations validate \
    <quality-observations.json>
  ```

- Observation config: assess the project and read its `INVALID_*` diagnostics, then
  run the relevant assessment. Engine diagnostics verify acquisition and graph
  joins.
- Implementation or verification-method changes: run their owning verification command before
  reassessment.

Never report a fix as verified without command output or an auditable
observation.

### 5. Reassess

Run the same observation set and scope through `assess`. Compare like with like:

- acquisition/resolution state before and after
- each available score before and after; a score that was unavailable in the
  baseline stays reported as unavailable, never as zero
- recommendations closed, changed, or still open
- new evidence and the command that produced it

Repeat until remaining work is low-return, deferred, blocked by external state,
or requires a human decision.

## Observation configuration

`improve` may create or repair:

- `.quality/config/observation-sources.yaml`
- `.quality/config/observation-sets.yaml`
- `.quality/config/views.yaml`

Use the configuration templates under `assets/`. Never vendor a copy of a
schema: a copy cannot be checked against the contract and drifts the moment the
contract moves.

For the observation manifest, obtain the current schema from
`quality-tools observations schema`.

Configuration files — sources, sets, views — are validated by the engine itself
when you assess the project: an invalid profile, set, or view reports an
`INVALID_*` diagnostic naming the exact `yamlPath`. That is the authority, since
it is the parser that actually runs. Read the diagnostics rather than
pre-validating against a schema.

Use `quality-observations.template.json` as the canonical output example.

### Sources

One profile represents one acquisition integration, such as one GitHub Actions
workflow, one local result folder, or one provider the reading application
supplies. It answers only:

- which transport fetches results: `github-actions`, `local-folder`, or `host`
- for the two file transports, which `observation_path` contains canonical
  `quality-observations.json` content
- for `host`, which `host.provider` the reading application resolves

A file-based source never selects a parser. Raw JUnit, Playwright, telemetry,
or custom gate output must be converted by its producer before the source reads
it. Do not create a source profile until the canonical file exists or its emit
step is being added in the same authorized change.

A `host` profile is the exception, and only because the reading application —
not this configuration — owns the fetch. Its provider may read a native report
directly. The engine still normalizes, resolves, and diagnoses every record it
returns, so a host provider gets no record past a check a canonical file must
pass. Which providers resolve depends on who reads the repo; one that is not
registered is reported as a diagnostic rather than read as nothing.

A local-folder profile reads one file. A GitHub Actions profile may select
several uploaded artifacts from one workflow run; every matching
`observation_path` must use the same canonical contract, and the source merges
their observations.

### Observation sets

An observation set names profiles reviewed together, in precedence order. Use a
single-profile set to debug one source. Feature filtering belongs to saved views,
not observation sets.

### Saved views

Views are saved assessment scopes over exact `features[].id` values from
`.quality/project-map.yaml`. They answer only "which features are included?"
They may overlap when independently releasable scopes share features. Do not
infer ids from evidence-directory names and do not create a saved
`whole-project` view; whole project is built in.

A view does not select observation sources, copy feature data, change scoring,
or identify a build. The observation set answers "which runtime sources?" and
the observed revision/run identifies a concrete release candidate.

## Runtime Join Contract

- `evidence.path` is the canonical repo-relative evidence identity.
- `evidence.test_case` optionally pins one case within the path; matching is
  trimmed and case-insensitive.
- Use the exact `test_case` emitted after native-report conversion. Never derive
  it from a shortened source-code label when the reporter emits a nested or
  otherwise transformed identity.
- Apply the same rule to manual, smoke, and agent evidence: a checklist heading,
  workflow label, or scenario title becomes a pin only when the canonical
  producer emits that exact identity. Before then it belongs in `notes` or
  `command`, not `test_case`.
- An unpinned row matches any observed case for its path.
- A pinned row matches only that case.
- Never mix pinned and unpinned evidence rows for the same path.
- Every canonical record supplies `path` plus optional `test_case`. `path`
  matches `evidence.path`; `test_case` matches `evidence.test_case`.

If one observation matches both a file-level and pinned row, remove the overlap
across all feature maps: keep the verification method file-level or pin every distinct row.

## Connect an observation source

Follow this sequence. Do not ask the user to choose a parser or config shape.

1. **Choose the producer.** Identify the workflow, local command, telemetry
   query, or manual gate that determines the result.
2. **Choose stable join keys.** Read the mapped `evidence.path` and optional
   `evidence.test_case`. The producer must emit those exact identities. Search
   all maps for the path and reject mixed pinned/unpinned strategies before
   configuring the source.
3. **Arrange canonical emission at the producer boundary.**

   If editing the producer is explicitly authorized, add only the mechanical
   serialization and upload glue needed to publish the already-determined
   result. Otherwise, do not edit the producer: provide the exact command and
   upload change as a proposal, record the emission gap, and do not configure a
   source that pretends the canonical file already exists.

   Use the applicable producer command:

   - JUnit:

     ```bash
     npx --yes @shiplightai/quality-tools@^0.3.0 observations from-junit \
       <report.xml> --output quality-observations.json
     ```

   - Playwright JSON:

     ```bash
     npx --yes @shiplightai/quality-tools@^0.3.0 observations from-playwright \
       <report.json> --output quality-observations.json
     ```

   - Smoke, health, telemetry, static, or manual gate:

     ```bash
     npx --yes @shiplightai/quality-tools@^0.3.0 observations record \
       --path <evidence.path> \
       --test-case <optional-evidence.test_case> \
       --status <pass|fail|error|skipped> \
       --output quality-observations.json
     ```

     Omit `--test-case` when the evidence row is file-level rather than pinned
     to a named case.

   - When several converters or record commands contribute observations, write
     each command to a separate shard and merge them:

     ```bash
     npx --yes @shiplightai/quality-tools@^0.3.0 observations merge \
       <shard...> --output quality-observations.json
     ```

   GitHub Actions metadata comes from `GITHUB_SHA`, `GITHUB_REF_NAME`, and
   `GITHUB_RUN_ID`. Outside GitHub Actions, supply `--commit`; `--branch`,
   `--run-id`, `--run-url`, and `--observed-at` are optional.

4. **Schema-validate before upload.**

   ```bash
   npx --yes @shiplightai/quality-tools@^0.3.0 observations validate \
     quality-observations.json
   ```
   Compare the canonical observations with every mapped identity they are meant
   to satisfy. Count exact matches, unmatched mapped methods, unmatched
   observations, and ambiguous observations from parsed output—not prose
   estimates. Do not call the connection complete while an intended method is
   unmatched or ambiguous.

5. **Publish canonical files.** Upload one `quality-observations.json` per
   selected artifact. A workflow may publish several selected artifacts, but
   every one uses the same contract. Raw native reports may remain alongside
   the canonical file for diagnosis; the quality engine never parses them.
6. **Configure the transport.** Copy
   `assets/observation-sources.template.yaml`. Set `transport`, then either
   `observation_path` plus `github` or `local_folder` for a file transport, or
   `host.provider` for a host transport. File-transport configuration contains
   no parser list or format selection.
7. **Add the profile to an observation set.**
8. **Run `assess`.** Verify source acquisition first, then verify every
   observation resolves to the intended evidence identity. Use the engine's
   resolution audit as the authority; repair mechanical join keys or report the
   remaining structural decision.

The canonical file is strict JSON:

```json
{
  "schema_version": 1,
  "revision": { "commit": "abc123", "branch": "main" },
  "run": { "id": "123", "url": "https://example.test/runs/123" },
  "observed_at": "2026-07-26T18:00:00Z",
  "observations": [
    {
      "path": ".github/workflows/publish.yml",
      "test_case": "tarball-size",
      "status": "pass"
    }
  ]
}
```

`schema_version`, `revision.commit`, `observed_at`, and `observations` are
required. Status is exactly `pass`, `fail`, `error`, or `skipped`. Per-record
`observed_at` and `note` are optional. Duplicate normalized
`path + test_case` identities invalidate the whole file. Absence means
unobserved; never manufacture a missing record.

For a CI smoke or health gate, map the workflow file as `evidence.path`, use the
step/check name as `evidence.test_case`, and emit those values through
`observations record`. Without the canonical file, record an evidence gap rather
than pretending the workflow is observed.

## Generate fix prompts

For agent-ready evidence-gap prompts:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 fix-prompts \
  --project-path <repo-root> \
  --output .quality/fix-prompts.md
```

Options include:

- `--format json`
- `--target <target-id>`
- `--limit <n>`
- `--include-covered`

Use the package command, not a custom prompt generator. Generated prompts are
tool output. A producer creates any required tests; `map-feature` confirms and
maps the result.

## Edit boundaries

`improve` may:

- edit observation config
- edit an authorized workflow observation-emission step
- apply contract-conformant `evidence.path`, `evidence.test_case`, and
  `proof_gap` repairs after reading the `map-feature` contract
- invoke `map-project` or `map-feature` for deeper graph changes

It must not:

- author tests, fixtures, or producer-owned reports
- write run outcomes into quality maps
- hand-edit generated recommendations or fix prompts
- mint a feature slug for project-wide work
- self-validate structure or accept risk
- include secrets or private customer data in artifacts

## Report

Report:

- baseline and final feature scope, observation set, and observed revision/run
- root-cause class for each addressed recommendation
- graph, evidence, implementation, or wiring changes made
- verification commands and auditable outcomes
- every available score before and after, with the reason for any unavailable one
- remaining work split into agent-actionable, external blocker, deferred, and
  human decision
