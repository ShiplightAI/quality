# Add product sources

**Outcome:** Requirements outside the repository can inform future project and
feature mapping.

**Use this when:** Important intent lives in Jira, Linear, Notion, Google Docs,
or another system the repository scan cannot discover on its own.

Quality records these locations in `.quality/config/sources.yaml`. The file
remembers which sources matter; the agent still needs working credentials or a
connector to read them.

## Ask your agent

For a tracker:

```text
Add our Linear team ENG as a product source for Quality. I am choosing this
source, so record its origin as human. Then remap the project using it.
```

For a filtered tracker view:

```text
Add the Jira filter "project = PAY AND labels = customer-facing" as a human
product source, then remap the project using it.
```

For an external document:

```text
Add our PRD at <link> as a human product source for Quality, then remap the
project using it.
```

## What the agent does

The agent records:

- A stable key or location for the source.
- Whether it is a repository document, tracker query, or external document.
- Whether a person or agent chose to include it.
- Whether it is current, stale, superseded, or rejected.
- An optional label or note.

On later mapping work, the agent reads the source list and uses reachable,
current entries as context. Adding an entry does not change the graph or any
score by itself; remapping is a separate step.

## Decisions that remain yours

- Which source is authoritative.
- Whether a source is still current.
- Whether an old source should be marked stale, superseded, or rejected.
- Whether requirements found there accurately describe the product.

Be explicit when the choice is yours. A source with `origin: human` is durable
author input. An agent-origin, current source is treated as something the scan
could rediscover and may be removed during a rewrite.

When one source replaces another, keep both entries and mark the old one
`superseded` with a reference to the replacement. This preserves the history of
why requirements changed.

## Verify the result

- `.quality/config/sources.yaml` contains the source and records `origin: human`.
- Its status is accurate.
- A remapping report says whether the source was reachable and used.
- Any features or priorities derived from it cite recognizable information.

You can ask:

```text
Which configured product sources did the last mapping use, which were
unavailable, and what changed because of them?
```

## Troubleshooting

**The source cannot be reached.** Provide the required connector or credentials.
The agent should report the source as unavailable, not invent requirements.

**Nothing changed.** Adding a source does not automatically remap the project.
Ask for `/quality map-project` or `/quality map-feature <id>` after the source is
available.

**A source disappeared.** Check whether it was recorded with `origin: agent`.
Add it again as human-origin if you are deciding that it belongs.
