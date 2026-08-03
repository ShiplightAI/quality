# Speckit Project

`speckit-project` is an optional agent skill for planning and carrying out
feature work. It helps a team turn product intent into a feature breakdown,
keep one feature active at a time, and move that feature from specification to
implementation.

The skill works with [GitHub Spec Kit](https://github.com/github/spec-kit) when
a project uses it. It also supports a lighter, spec-less workflow for existing
projects that do not want to adopt Spec Kit.

This skill is a development workflow, not part of the Shiplight Quality engine.
It can produce specifications, implementation, tests, and verification records
that later serve as evidence, but it does not create quality maps or calculate
quality scores.

## What it does

The skill can help you:

- create or refine `docs/PRD.md`;
- split the product into numbered, dependency-aware features in
  `docs/feature-breakdown.md`;
- select the active feature and keep its branch and project pointers aligned;
- guide the Spec Kit lifecycle from specification and clarification through
  planning, tasks, analysis, and implementation;
- handle maintenance work that changes existing features without inventing a
  new feature; and
- hand completed work to Shiplight's testing and verification skills when they
  are installed.

The bundled templates in [`assets/`](assets/) provide starting points for the
PRD and feature breakdown.

## Install

Run the following command from the project in which you want to use the skill:

```bash
npx skills add ShiplightAI/quality/agent-skills \
  --skill speckit-project \
  --all \
  -y
```

Use `-a codex`, `-a claude-code`, or another agent supported by the `skills`
CLI instead of `--all` when you want to install it for only one agent.

For the full Spec Kit workflow, install the `specify` CLI and initialize Spec
Kit for your project and agent. The [Spec Kit documentation](https://github.com/github/spec-kit)
explains that setup. These steps are not required for the spec-less workflow.

Some execution stages can hand work to Shiplight commands such as
`/shiplight verify`, `/shiplight cover`, and `/shiplight review`. Those handoffs
require the corresponding Shiplight skills; the planning workflow can still be
used without them.

## Use

Invoke the skill with the task you want it to perform. Typical requests include:

```text
/speckit-project init
/speckit-project breakdown
/speckit-project select 003-checkout
/speckit-project lifecycle
/speckit-project maintenance
```

With no command, the skill performs a read-only status check. It reports the
current mode, active feature, branch, available planning artifacts, and the next
step without changing files or switching branches.

The complete workflow, safety boundaries, and completion rules are documented
in [`SKILL.md`](SKILL.md).
