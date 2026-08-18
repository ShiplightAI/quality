---
name: quality
description: "Construct, assess, and improve a repository's quality project graph and four-score quality index. Use only when the user explicitly invokes /quality or asks for a quality status, score, index, map, graph, or posture—not for a generic request to improve code quality. Guides new-repository setup, project and feature mapping, saved assessment scopes, verification-method mapping, runtime assessment, and score-directed improvement while preserving independent scoring and human validation. Commands: start, status, map-project, map-feature, assess, improve, help."
---

# Quality

Quality answers:

> What must this project deliver, which methods verify each promise, and what does
> the current evidence justify believing?

It maintains a **quality project graph** and asks the deterministic
`quality-tools` engine to compute a four-score **quality index** from that graph.
It never invents a score or treats a score as the goal.

**Before any command, read
[independence](references/_shared/independence.md).** A system cannot establish
trust by grading its own claims. This principle governs every workflow,
especially evidence classification and human validation.

## Use one formal vocabulary

Use these terms consistently:

| Term | Formal meaning |
| --- | --- |
| Repository | Filesystem storage boundary containing `.quality/`; not a graph node |
| Project | The governance and assessment boundary represented by one `.quality/project-map.yaml`; one repository currently contains one quality project |
| Feature | A reusable, independently checkable project capability with one `quality-map.yaml` |
| View | A named, saved assessment scope selecting feature ids; it never copies or changes those features |
| Observation set | A named bundle of runtime-result sources; orthogonal to the feature scope |
| Assessment | Project + whole-project or view scope + optional observation set + observed revision/run, producing one quality index; without an observation set the index carries the three static scores and no Quality score |
| Release candidate | A concrete build, version, commit, or artifact covered by an assessment; not a persistent graph grouping |
| Product | Optional descriptive language for what the project delivers; it has no graph or scoring semantics |
| Intent validation | Human confirmation that features, priorities, and checks represent accepted product intent |
| Verification method | A repeatable or inspectable way to evaluate whether implementation or observed behavior satisfies a check |
| Reasoning-based verification | Evaluation by reasoning about an implementation or model, including review, static analysis, model checking, and formal verification |
| Empirical verification | Evaluation by executing or monitoring a system, recording an observation, and comparing it with a check |
| Evidence | Information from reasoning or evaluated observations that supports or challenges a check |
| Empirical observation | A recorded fact about executed or production behavior |
| Runtime observation | Quality's standardized result record; it can carry an executable reasoning tool's outcome without making the underlying method empirical |
| Proof | A deductive argument under stated assumptions; reserve this term for formal or deductive proof |

Do not introduce a second grouping such as `release area`. Use a view when a
reusable subset of features must be assessed together.
Use **evidence gap** in prose; `proof_gap` is only the legacy literal field name
in the current quality-map contract.

## The quality project graph

Explain this model before asking a new user to choose an artifact or command:

```text
repository (storage)
└── quality project
    └── features
        └── quality checks: what must hold
            └── verification methods: how each check is evaluated
                └── runtime observations: what happened when executable methods ran?

view ─────────────── selects project features
observation set ──── selects runtime-result sources
```

The graph is represented by checked-in files and the evidence artifacts they
reference:

| Graph layer | Artifact | Meaning |
| --- | --- | --- |
| Project → features | `.quality/project-map.yaml` | Project identity, feature boundaries, priorities, status, and dependencies |
| Feature → checks → verification methods | `.quality/evidence/<feature>/quality-map.yaml` | What must hold for one feature and which tests, workflows, telemetry, static checks, or manual records evaluate it |
| Executable methods → runtime sources | `.quality/config/observation-sources.yaml` | Where canonical observation files come from |
| Runtime source bundles | `.quality/config/observation-sets.yaml` | Which runtime sources are assessed together |
| Saved assessment scopes | `.quality/config/views.yaml` | Which project-map features are included together |
| Evidence artifacts | Files referenced by `evidence.path` | Tests, workflows, reports, runbooks, telemetry, or other auditable evidence |

IDs, paths, and optional test-case names are the graph's edges. Generated
recommendations and `fix-prompts.md` are engine output, not graph source.

Example:

```text
repository: monots
project: Shiplight developer tooling
features:
├── 001-web-agent-engine
├── 002-shiplightai-cli
└── 003-shiplightai-mcp-server

view shiplightai = [001-web-agent-engine, 002-shiplightai-cli]
view mcp-server = [001-web-agent-engine, 003-shiplightai-mcp-server]
```

CLI and MCP are independently releasable scopes. A particular CLI tarball or
MCP package version is a release candidate only when an assessment identifies
that concrete revision/artifact.

Shared contracts:

- [Independence and human gates](references/_shared/independence.md)
- [Graph layout and edit ownership](references/_shared/layout.md)
- [Authored and runtime vocabularies](references/_shared/vocabularies.md)

## The workflow

Guide users through the lifecycle; do not make them infer an order from the
artifact names:

1. **Start or inventory.** Determine whether the repository is spec-driven,
   brownfield, or already partially mapped.
2. **Map the project.** Construct project → feature structure and choose the
   highest-priority feature.
3. **Map each feature.** Define its quality checks and connect existing
   verification methods.
4. **Connect runtime.** Arrange for evidence producers to publish canonical
   `quality-observations.json`, within the producer edit boundary below, then
   configure transport-only sources and sets that locate those files.
5. **Assess.** Run `quality-tools` and explain the scores together. Coverage,
   evidence confidence, and structure confidence are available from step 3
   onward; Quality also needs step 4.
6. **Improve.** Diagnose the weak score, improve the underlying structure,
   evidence, implementation, or runtime wiring, then assess again.
7. **Repeat.** Expand feature by feature, highest priority and risk first.

`/quality start` orchestrates steps 1–5 for a new or unmapped repository. The
more specific commands let an experienced user enter at any stage.

## Producer edit boundary

Quality never authors tests, edits producer-owned reports, or changes the logic
that determines a result.
When explicitly authorized, Quality may add only mechanical workflow glue that
serializes and uploads an already-determined result as canonical
`quality-observations.json`. It must not manufacture or reinterpret a status or
change test commands, gates, retries, or failure semantics.

Without explicit authorization, propose the exact emit/upload change and record
the observation gap without editing the producer. Follow
[independence](references/_shared/independence.md) for the complete boundary.

## Canonical join-key invariant

`evidence.test_case` is a runtime join key, not a readable sub-artifact label.
Before retaining or adding one, locate an actual canonical observation record
(or a freshly converted native report) containing the same `path` and
`test_case`. Cite that record during the audit. Source test names, checklist
headings, workflow jobs/steps, and scenario titles do not satisfy this
precondition, even when copied verbatim. If no record exists, remove or omit the
pin, keep the readable pointer in `notes` or `command`, and record the runtime
emission gap. The only exception is `improve` wiring the producer to emit that
exact key in the same change.

## Tool version gate

This skill's canonical-observation contract requires
`@shiplightai/quality-tools` 0.3.0. Before invoking `quality-tools` or authoring
observation configuration, verify that interface:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 observations --help
```

Do not fall back to an unversioned package or 0.2.x. If the pinned package is
unavailable, do not write transport-only observation config; report the package
publication blocker. When working inside the `quality-tools` source checkout,
use its repository-local CLI instead:

```bash
pnpm exec tsx packages/quality-tools/src/cli.ts observations --help
```

## Commands

The optional `[scope]` argument is a natural-language focus, not a required
project name, filesystem path, or saved assessment view. For `start`, use it to
tell the agent which capability or risk area to map first (for example,
`billing` or `checkout`); omit it when the agent should choose from the
repository's priorities. A saved assessment scope is a separate named view in
`.quality/config/views.yaml`.

| Command | Outcome | Reference |
| --- | --- | --- |
| `start [scope]` | Bootstrap the graph in a new, brownfield, or partially mapped repository | [start](references/start.md) |
| `status [scope]` | Read existing artifacts and recent results; do not run verification/scoring commands or edit files | [status](references/status.md) |
| `map-project [scope]` | Construct or reconcile project → feature structure | [map-project](references/map-project/index.md) |
| `map-feature <target>` | Construct or improve one feature's checks and verification-method mappings | [map-feature](references/map-feature/index.md) |
| `assess [scope]` | Refresh and explain the four scores without changing graph source or evidence artifacts | [assess](references/assess.md) |
| `improve [scope]` | Diagnose weak scores, improve the underlying system, and reassess | [improve](references/improve/index.md) |
| `help [command]` | Explain commands without executing them | [help](references/help.md) |

Bare `/quality` means `status`, followed by the command menu.

Load the supporting [project-map contract](references/map-project/project-map.md)
or [brownfield reconstruction](references/map-project/brownfield-reconstruction.md)
only when `start` or `map-project` requires it.

## Routing contract

1. Match the exact command first, then its natural-language outcome. There are
   no legacy command aliases.
2. Pass unconsumed text as scope or target:
   `/quality map-feature checkout` → `map-feature` with target `checkout`.
3. Read the command reference and every shared/reference file it requires.
4. If the request names no command:
   - use `start` when the repository has no usable quality graph and the user
     asked to establish one;
   - use `status` for a read-only question;
   - use `assess` when the user asks to refresh or compute scores;
   - use `improve` when the user asks to raise quality posture or close gaps.
5. State what will be read, generated, or edited before acting.
6. Stop at human gates. An agent may propose structure, priorities, reviewed
   checks, or accepted risk, but must never validate intent for the owner.

## The four scores and the honest improvement lever

Always report these side by side. Never blend them into a single agent-authored
verdict.

| Score | Question | Improve the underlying condition by |
| --- | --- | --- |
| Coverage | Does every declared check have a mapped verification method? | Create or map a missing method |
| Evidence confidence | Are the mapped methods strong enough? | Use a stronger appropriate modality or add a meaningful gate |
| Quality | Are current observed results passing? | Fix the implementation or method, refresh stale results, or repair runtime wiring and rerun it |
| Structure confidence | Are these the right features, checks, and priorities? | Ask a human to correct or validate proposed structure |

Quality is the only one of the four that needs runtime observations. When no
observation set is configured or its results cannot be acquired, report the other
three as measured and say why Quality is missing.

Treat the score as a diagnostic, not a target. Never remove scope, weaken a
check, misclassify evidence, accept risk, or promote provenance to make a number
rise.

## Reporting integrity

- Copy scores, counts, and resolution totals from engine or parsed artifact
  output. When no structured total exists, enumerate first and calculate the
  count mechanically; verify that headings, totals, and lists agree.
- Group every cause under the score it actually affects. Missing or
  policy-insufficient verification methods affect coverage; method type and gate strength
  affect evidence confidence; runtime outcomes/acquisition/resolution affect
  Quality; feature/check/priority provenance and review affect structure
  confidence. Do not cite a structure gate as an evidence-confidence cause.
- Interpret policy fields independently using engine semantics. `require_gate`
  means any engine-recognized gate context; `required_contexts` carries exact
  context requirements such as `release-ci`. Prefer engine diagnostics over a
  narrower natural-language reinterpretation.
- Record a human decision without adding a name, email, account, or other
  attribution unless the user explicitly supplied that identity for the record
  or an authoritative artifact already contains it. Never infer attribution
  from Git config, environment metadata, or the operating-system account.

## Relationship to evidence producers

Quality maps and judges existing evidence. It may hand a concrete evidence gap to a
producer such as `/shiplight cover`, `/shiplight create-yaml-tests`, or
`/shiplight create-agent-verification`. Producers create or run tests and other
verification methods; Quality confirms the resulting artifact, connects it to the graph, and
remeasures. The only producer-side exception is the explicitly authorized
mechanical workflow glue defined above.
