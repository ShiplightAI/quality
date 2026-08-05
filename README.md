# Shiplight Quality

AI can generate code, tests, and reviews faster than people can inspect them.
Traditional line-by-line review will not scale with that volume.

As agents take on routine work, human responsibility moves higher: people
approve what the software should do and how it will be verified. Coding agents
can draft specifications and tests, while the Quality agent proposes checks and
maps existing proof. People retain control by reviewing and ratifying the
important decisions and any accepted risk.

Shiplight Quality provides an open-source process and toolset for this model. It
connects product intent to independent, repeatable proof:

```text
requirements (PRDs)
        ↓
features (specs)
        ↓
quality checks
        ↓
proof definitions (tests and other evidence)
        ↓
runtime observations (did the proof pass?)
```

Requirements define the desired outcomes, specifications break them into
features, and quality checks state what must hold. Tests, workflows, telemetry,
and other auditable artifacts can provide proof. Runtime observations record
whether that proof passed. Quality maps these relationships in `.quality/`,
finds gaps, and evaluates the result independently.

## Principles

### Let agents construct; let people control

Coding agents should perform routine development work such as drafting
specifications and creating tests. The Quality agent maps features, proposes
checks, and connects existing proof without creating or changing that proof.
People should review product intent and the model used to verify it, not attempt
to read every line of AI-generated code. Quality makes feature maps, checks,
proof, priorities, and verification gaps visible so people can review and
ratify the key decisions without becoming the delivery bottleneck.

### Start with the behavior that matters

Quality begins with product expectations, not test counts. A quality check
describes something that must remain true for a user, a system, or an operating
team. Proof is then connected to that check. This makes missing proof visible
even when every existing test passes.

### Keep proof separate from judgment

The systems that build and test software produce facts, proof artifacts, and
runtime results. Quality evaluates those artifacts and observations, but does
not control the result they report. This one-way flow prevents a system from
grading its own work.

### Make scoring reproducible

Scores come from a deterministic engine using declared checks, mapped proof,
runtime observations, and recorded human decisions. An agent or user interface
cannot invent a score or adjust one by opinion.

### Make human approval explicit

Agents can propose features, checks, and priorities, but they cannot approve
their own proposals or accept risk for a person. Quality preserves the origin
of generated work and records human review separately. Approval is an explicit
event, not something inferred from a passing test or an agent's confidence.

### Show what is uncertain

Quality reports four measures instead of blending different kinds of confidence
into a single number:

| Measure | Question it answers |
| --- | --- |
| Quality | Is the current proving evidence passing? |
| Coverage | Does every declared check have proof? |
| Evidence confidence | Is the mapped proof strong enough? |
| Structure confidence | Are these the right features, checks, and priorities? |

Keeping these measures separate makes the next action clearer. A low quality
score calls for a different response from weak evidence or an unreviewed set of
requirements.

## What is included

This repository contains:

- [`@shiplightai/quality-map`](packages/quality-map/README.md), the schema,
  parser, and validator for quality maps;
- [`@shiplightai/quality-core`](packages/core/README.md), the deterministic
  analysis engine;
- [`@shiplightai/quality-tools`](packages/quality-tools/README.md), the command
  line interface and public programmatic API;
- the [`quality` agent skill](agent-skills/quality/SKILL.md), which helps create
  and maintain a project's `.quality/` graph;
- the [`spec-project` agent skill](agent-skills/spec-project/SKILL.md), which
  drives portable or Spec Kit-backed product specifications through
  implementation and Shiplight testing evidence; and
- [Quality Explorer](apps/explorer/README.md), a local, read-only web interface
  for inspecting the result.

Quality Explorer never writes to the project it displays. Changes to quality
maps go through the same version control and review process as other project
files.

## Get started

### Use the agent skills

From the project you want to map, install the `quality` skill with the
[`skills`](https://www.npmjs.com/package/skills) CLI:

```bash
npx skills add ShiplightAI/quality/agent-skills --skill quality --all -y
```

Then ask your agent to run `/quality start`. The skill inventories the project,
creates the smallest useful quality graph, and keeps inferred structure
unapproved until a person reviews it.

For the complementary producer workflow, install `spec-project`:

```bash
npx skills add ShiplightAI/quality/agent-skills --skill spec-project --all -y
```

Then invoke `/spec-project init`, `/spec-project lifecycle`, or
`/spec-project maintenance`. It uses portable Markdown by default and uses
GitHub Spec Kit only when the target repository has adopted it or you explicitly
request installation. It reconciles product changes into existing feature specs
before permitting a new feature. Its `/shiplight cover` handoff requires the
corresponding Shiplight skill; without it, specification and implementation
remain available but testing-evidence production is reported as unavailable.

The installer creates agent-specific files and `skills-lock.json` in the target
project. Treat them as generated installation state unless your project has
chosen to version them.

### Use the command line

Validate an existing quality map:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 validate \
  .quality/evidence/<feature>/quality-map.yaml
```

Analyze a project after it has a saved observation set:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 analyze \
  --project-path . \
  --observation-set <set-id>
```

See the [`quality-tools` documentation](packages/quality-tools/README.md) for
observation formats, saved scopes, and generated recommendations.

## Repository layout

```text
agent-skills/quality/        Agent workflow for creating and maintaining quality maps
agent-skills/spec-project/   Producer workflow from product specs to testing evidence
apps/explorer/               Local, read-only Quality Explorer application
packages/quality-map/        Quality-map contract, parser, and validation
packages/core/               Deterministic analysis engine
packages/quality-tools/      Published CLI and public API
packages/ui/                 Shared presentation package under development
docs/                        Architecture and contributor documentation
examples/                    Example quality projects
scripts/                     Repository checks used by CI
tests/                       Cross-package contract and integration tests
```

The dependency direction is deliberate:

```text
quality agent ─┐
explorer UI ──┼──▶ quality-tools / core ──▶ quality-map

proof producers ──▶ proof artifacts ──▶ Quality
```

Lower-level packages do not depend on the UI, agent workflows, or the systems
that produce proof. See [the architecture guide](ARCHITECTURE.md) for
the full package boundaries.

## Development

Requirements:

- Node.js 24 or newer
- pnpm 11

Install dependencies and run the repository checks:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

To inspect another local repository with Quality Explorer, start the application
with an absolute project path:

```bash
QUALITY_PROJECT_ROOT=/absolute/path/to/project \
  pnpm --filter @shiplightai/quality-explorer dev
```

Then open <http://127.0.0.1:4173/quality-explorer>. The project root is fixed
when the process starts and cannot be changed by a browser request.

## License

Shiplight Quality is available under the MIT License. See [LICENSE](LICENSE).
