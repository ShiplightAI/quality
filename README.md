# Shiplight Quality

## Try Quality on a project (in Claude Code)

From the repository you want to assess, install the `quality` agent skill for
Claude Code:

```bash
cd /path/to/your/project
npx skills add ShiplightAI/quality/agent-skills \
  --skill quality --agent claude-code -y
```

The command above installs the skill only for Claude Code. To install it for
several agents, list them after `--agent` (for example,
`--agent claude-code cursor`); to install it for every supported agent, use
`--all` instead.

Then open Claude Code in that repository and give it this prompt:

```text
/quality start
```

The agent will inventory the repository, propose a small quality graph for the
highest-priority feature, connect the proof that already exists, and run an
initial assessment when runtime results are available. It will pause when a
human needs to confirm feature boundaries, priorities, or quality checks.

After the first pass, inspect the proposed files under `.quality/` and answer
the agent's review questions. Then continue with the next command it recommends,
usually `/quality improve` or `/quality map-feature <feature>`.

Want to control the first slice? Include it in the prompt:

```text
/quality start checkout

Start with the checkout feature. Map existing proof, identify gaps, and stop
when you need me to confirm the proposed structure or checks.
```

The skill evaluates existing specifications, tests, workflows, reports, and
other evidence; it does not create tests or approve its own proposals. See the
[`quality` skill](agent-skills/quality/SKILL.md) for all commands and workflow
details.

![Quality Explorer showing the overview for a project: a quality score of
100/100 alongside separate coverage, evidence confidence, and structure
confidence scores, the gaps and release blockers counts, and the runtime
observation set fetched from a CI workflow run.](docs/assets/quality-explorer-overview.png)

## What Quality does

Quality connects product intent to independent, repeatable proof:

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

Requirements define desired outcomes, checks state what must hold, and tests,
workflows, telemetry, or manual records provide proof. Quality maps these
relationships in `.quality/` and keeps missing or weak links visible. Agents can
propose maps; people review structure and accepted risk.

The engine reports four separate measures:

| Measure | Question it answers |
| --- | --- |
| Quality | Is the current proving evidence passing? |
| Coverage | Does every declared check have proof? |
| Evidence confidence | Is the mapped proof strong enough? |
| Structure confidence | Are these the right features, checks, and priorities? |

See [the concepts guide](docs/README.md) for the model and trust boundaries.

## Optional: Use `spec-project` for spec-driven testing

[`spec-project`](agent-skills/spec-project/README.md) is an optional companion
for turning product intent into accepted feature specs and aligned testing
evidence. It produces artifacts; `quality` independently evaluates them. The
skills can be used together or separately.

Install the optional `spec-project` skill for Claude Code:

```bash
npx skills add ShiplightAI/quality/agent-skills \
  --skill spec-project --agent claude-code -y
```

Then invoke `/spec-project init`, `/spec-project lifecycle`, or
`/spec-project maintenance`. The installer creates agent-specific files and
`skills-lock.json` in the target project.

For the quality graph model and independence guarantees, see [the concepts
guide](docs/README.md) and [how Quality earns your trust](docs/concepts/trust-boundaries.md).

## Development

Requirements: Node.js 24 or newer and pnpm 11.

Install dependencies and run the repository checks:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

To inspect another local repository with Quality Explorer, start the application
with an absolute project path. For GitHub Actions observations, authenticate
with `gh auth login` first and pass the token; omit the first line for
local-only observations:

```bash
GITHUB_TOKEN="$(gh auth token)" \
QUALITY_PROJECT_ROOT=/absolute/path/to/project \
  pnpm --filter @shiplightai/quality-explorer dev
```

The token is passed only to the local process. `dev` starts the Next.js
development server with hot reload; it does not run an assessment or deploy
the explorer.

Then open <http://127.0.0.1:4173/quality-explorer>. The project root is fixed
when the process starts and cannot be changed by a browser request.

## License

Shiplight Quality is available under the MIT License. See [LICENSE](LICENSE).
