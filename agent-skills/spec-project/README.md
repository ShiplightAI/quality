# Spec Project

`spec-project` is an agent skill for taking a software project from product
intent to an implemented, verified feature. It keeps the product specification,
implementation plan, code, and testing evidence aligned as the project changes.

Use it when you want an agent to:

- turn a product idea into a PRD and feature roadmap;
- specify, plan, implement, and verify one feature end to end;
- update an existing feature without creating a duplicate feature spec;
- coordinate GitHub Spec Kit when the repository already uses it; or
- hand completed work to Shiplight for tests and durable testing evidence.

It is an orchestration skill, not a standalone CLI. You invoke it through a
coding agent after installing the skill.

## How the workflow fits together

```text
product intent
    |
    v
PRD -> feature breakdown -> accepted feature spec -> plan and tasks
                                                    |
                                                    v
                                          tests and implementation
                                                    |
                                                    v
                                      verification and test report
```

The feature spec is the authority for product behavior. Code implements that
behavior; tests, verification, and reports prove it. When those artifacts
disagree, `spec-project` reconciles the drift instead of treating the newest
artifact as automatically correct.

## Specs are current product snapshots

Every feature spec describes the latest accepted state of the product, not a
chronological log of changes. When behavior changes, `spec-project` updates the
current requirements and removes superseded behavior in both portable and Spec
Kit modes.

Git preserves history, while plans and release notes carry migration details.
The spec remains one unambiguous source for current implementation and testing.

Before creating a feature, the skill checks the existing roadmap and feature
specs. A change that extends an existing capability stays with that feature,
even when the change is large or was described as a new feature in a ticket.
This keeps the feature model stable and prevents overlapping specs.

## Install

Follow the [agent-skill installation instructions](../../README.md#get-started),
then invoke the installed skill from your coding agent.

The default workflow uses portable Markdown and requires no other
specification tool. GitHub Spec Kit is optional. Shiplight is required only
when you ask the workflow to produce tests, `test-spec.md`, and
`test-report.md`.

## Quick start

For a new project, establish the product intent and roadmap:

```text
/spec-project init
```

Review and accept the resulting `docs/PRD.md` and
`docs/feature-breakdown.md`. Then drive the first feature through the complete
lifecycle:

```text
/spec-project lifecycle 001-user-sign-in
```

The agent will stop for product decisions when necessary. Acceptance of the
feature spec is a gate before implementation; it is not acceptance of the
implementation or its evidence.

For a change to an existing capability, describe the desired behavior and use
maintenance:

```text
/spec-project maintenance Add passkey sign-in to the existing authentication flow
```

The skill first identifies every affected existing feature, updates the
accepted product behavior, and then coordinates the smallest implementation
and proof changes.

To inspect a project without changing it, invoke the skill with no operation:

```text
/spec-project
```

The result reports the detected mode, active or inferred feature, current
phase, artifacts found, drift, and next gate.

## Operations

| Operation | Use it for | Main result |
| --- | --- | --- |
| `init` | Starting or refining a project | `docs/PRD.md` and `docs/feature-breakdown.md` |
| `breakdown` | Turning an accepted PRD into durable product slices | Numbered features with dependencies and declared priorities |
| `select` | Choosing where a requested change belongs | An existing feature, or a justified new feature ID |
| `lifecycle` | Delivering one feature end to end | Accepted spec, plan, tasks, implementation, and evidence |
| `maintenance` | Changing, fixing, or refactoring an existing capability | Reconciled existing specs, implementation, and evidence |
| `batch` | Preparing several feature specs and plans | Accepted preparation in dependency order; no concurrent implementation |
| `autonomous` | Executing already accepted, unambiguous work | Dependency-ordered implementation that stops on product ambiguity |

A bare invocation is a read-only status pass. It does not create files, switch
branches, or run long test suites.

## Portable mode and Spec Kit mode

Portable mode is the default. The coding agent follows the repository's
existing conventions, or uses the bundled Markdown templates when no
conventions exist:

- [`assets/prd-template.md`](assets/prd-template.md)
- [`assets/feature-breakdown-template.md`](assets/feature-breakdown-template.md)
- [`assets/portable-feature-spec-template.md`](assets/portable-feature-spec-template.md)

Spec Kit mode is used only when the repository has a complete `.specify/`
setup or you explicitly request adoption. In that mode, Spec Kit creates and
maintains the feature spec, plan, tasks, implementation workflow, and its own
pointers. A partial `.specify/` installation is reported rather than silently
repaired.

The mode changes the mechanics, not the lifecycle or the authority of the
feature spec.

## Artifacts and ownership

| Artifact | Who creates or maintains it |
| --- | --- |
| `docs/PRD.md` | `spec-project` |
| `docs/feature-breakdown.md` | `spec-project` |
| `specs/NNN-feature-name/spec.md` | Spec Kit in Spec Kit mode; the coding agent in portable mode |
| `specs/NNN-feature-name/plan.md` | Spec Kit in Spec Kit mode; the coding agent in portable mode |
| `specs/NNN-feature-name/tasks.md` | Spec Kit in Spec Kit mode; the coding agent in portable mode |
| `specs/NNN-feature-name/test-spec.md` | `/shiplight cover` |
| Tests and verification artifacts | `/shiplight cover` and the relevant test producers |
| `specs/NNN-feature-name/test-report.md` | `/shiplight cover` |

`spec-project` never writes Shiplight-owned testing artifacts itself. If the
Shiplight skill is unavailable, specification and implementation can continue,
but the evidence phase remains incomplete and the agent reports the required
handoff.

## Completion means three separate things

- **Specification complete:** the accepted `spec.md`, `plan.md`, and `tasks.md`
  agree on the requested scope.
- **Implementation complete:** the code implements that accepted scope and the
  relevant implementation checks pass.
- **Evidence complete:** `/shiplight cover` has reconciled `test-spec.md`, run
  the relevant proof, and recorded it in `test-report.md`.

For a full lifecycle request, the feature is not done until all three states
are complete. Missing tools, blocked checks, and remaining risks are reported
instead of being treated as success.

## Safety and decision boundaries

- Product ambiguity stops the workflow for an owner decision.
- Priorities are preserved from an accepted source or recorded as `UNKNOWN`;
  the agent does not invent them.
- Branch creation, branch switching, commits, pull requests, merges, releases,
  and Spec Kit installation require an explicit request.
- Existing uncommitted work and unrelated changes are preserved.

For the complete agent contract, see [`SKILL.md`](SKILL.md). For Spec Kit
integration details, see [`references/spec-kit.md`](references/spec-kit.md).
