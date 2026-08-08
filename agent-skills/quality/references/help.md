# help — List commands or explain one

`help` is informational. It never runs a command or changes files.

## `/quality help`

Render the command menu from this skill's SKILL.md and explain invocation:

- `/quality <command> [scope-or-target]` runs a command.
- Bare `/quality` runs `status`, then presents the menu.
- `/quality help <command>` explains one command **without running it**.

Here, `scope` is an optional natural-language focus such as `billing` or
`checkout`. For `start`, it selects the first capability or risk area to map;
it is not a path and does not create a saved assessment view. Saved assessment
scopes are named views stored in `.quality/config/views.yaml`.

## `/quality help <command>`

Resolve the canonical command from the SKILL.md command table, read its
reference, and summarize:

- the user-facing outcome
- what it reads
- what it may generate or edit
- human gates
- when another command is the better entry point

There are no legacy aliases.
