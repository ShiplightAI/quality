# Spec Kit Adapter

Read this reference only when the repository has adopted GitHub Spec Kit or the
user explicitly requests adoption.

## Prerequisites

Confirm all of the following before invoking Spec Kit workflows:

- the `specify` CLI is installed;
- the repository has a complete `.specify/` setup for the active agent;
- the expected Spec Kit commands, templates, and scripts exist; and
- the working tree can tolerate the command's documented mutations.

Use the upstream setup instructions when installation is explicitly requested:
<https://github.com/github/spec-kit/blob/main/README.md>.

Do not install or initialize Spec Kit merely because `spec-project` was invoked.
Fall back to portable mode when the repository has not adopted it.

## Spec Kit Ownership

Spec Kit owns and maintains:

- `.specify/memory/constitution.md`;
- `specs/NNN-feature-name/spec.md`;
- `specs/NNN-feature-name/plan.md`;
- `specs/NNN-feature-name/tasks.md`; and
- its own active-feature pointers and agent context.

Do not hand-edit those artifacts from `spec-project`; invoke the corresponding
Spec Kit workflow to create or reconcile them. Spec Kit does not own
`test-spec.md`, `test-report.md`, or tests. Preserve the `/shiplight cover`
handoffs in the main skill.

When reconciling an existing feature, instruct the Spec Kit workflow to rewrite
`spec.md` as the latest accepted product snapshot. Before accepting its output,
confirm that superseded behavior and chronological amendments have been removed
and that a reader does not need git history or prior change requests to
understand current behavior. Spec Kit's ownership of the file does not weaken
the snapshot rule.

## Workflow Mapping

Map the core lifecycle to the commands installed for the active agent:

```text
specify -> clarify -> checklist -> plan -> tasks -> analyze
-> implement
```

For Codex installations these may appear as skills such as
`speckit-specify`, `speckit-clarify`, `speckit-checklist`, `speckit-plan`,
`speckit-tasks`, `speckit-analyze`, and `speckit-implement`. Other agents may
expose slash commands such as `/speckit.specify`. Inspect the initialized
integration instead of assuming one spelling.

After planning is accepted, return to the main lifecycle for the
regression-first `/shiplight cover` handoff, implementation, verification, and
final verification run.

## Pointers and Branches

Let Spec Kit commands maintain `.specify/feature.json` and generated agent
context. Do not create those files in portable mode or hand-edit them when a
Spec Kit command owns the update.

Feature selection does not itself authorize a branch mutation. Before running a
Spec Kit command that creates or switches a branch, confirm that the user
explicitly requested the branch operation and that uncommitted work will not be
stranded.

## Constitution

Run the Spec Kit constitution workflow only in Spec Kit mode and only when the
constitution is missing or does not establish product-spec authority. Portable
mode does not require a constitution.
