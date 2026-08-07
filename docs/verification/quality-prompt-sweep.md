# Quality prompt sweep: `screen-recorder`

Date: 2026-08-07  
Target: `/Users/feng/Shiplight/screen-recorder`  
Claude Code: 2.1.224, `sonnet` alias  
Quality CLI: `@shiplightai/quality-tools@^0.3.0`

## Scope and baseline

The target started clean on `main`, with the Quality and `spec-project` skills
installed and no `.quality/` directory. Its accepted feature candidates are
real recorder capabilities, including `001-extension-capture-core`,
`002-recorder-session-upload`, `003-transcription-layer`, and
`004-mcp-consumer-server`. The documentation placeholder `002-checkout` was not
used.

The pinned Quality CLI gate passed directly:

```text
npx --yes @shiplightai/quality-tools@^0.3.0 observations --help
```

The target was restored to its clean baseline after each run. Generated graphs
were kept in the sweep's temporary archive for inspection.

## Session and harness rules

- A plain `claude -p` invocation was treated as a new session; `--continue` was
  reserved for deliberate follow-ups.
- The supported Quality-only harness used `--strict-mcp-config`, which disables
  MCP without moving the target's `.mcp.json` and still loads project skills.
- Claude safe mode was not usable: it disables project skill resolution, so
  `/quality` returned `Unknown command`.
- The CLI accepts `--model sonnet` (which reported `claude-sonnet-5`); the
  literal `sonnet-5` selector is rejected.
- Each long run was allowed up to 15 minutes and used streamed output while
  polling. This follows the [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage),
  including `--allowedTools`, `--strict-mcp-config`, and stream output.
- The effective permission set was explicit and narrow: `Read`, `Glob`, `Grep`,
  `Edit`, `Write`, selected read-only Git/search commands, and
  `Bash(npx --yes @shiplightai/quality-tools@^0.3.0 *)` where validation required
  the published CLI.

## Results

| Scenario | Prompt | Session | Result |
| --- | --- | --- | --- |
| Read-only status with no graph | `/quality status` | New | **Pass.** Reported no graph and recommended `/quality start`; changed no files. |
| Command explanation | `/quality help start` | New | **Pass.** Explained graph layers, files, human gates, and when to use another command. |
| Bootstrap | `/quality start` | New | **Pass.** With scoped permissions and streamed Sonnet output, completed in about 8.6 minutes and wrote `.quality/project-map.yaml` plus the `001-extension-capture-core` map. It reported real evidence gaps and did not invent scores. |
| Persisted status | `/quality status` | Fresh | **Pass.** Re-read the generated graph, reported unmapped features and unknown scores, and recommended the next real feature. |
| Real feature mapping | `/quality map-feature 002-recorder-session-upload` | Fresh | **Pass after permission fix.** The first run stopped at the validator gate because `npx` was not allowed; the retry with the narrow `Bash(npx --yes @shiplightai/quality-tools@^0.3.0 *)` scope completed in about 4.8 minutes and wrote the map. |
| Assessment without observations | `/quality assess` | Fresh | **Pass.** Correctly refused to manufacture four scores and explained that `.quality/config/` and an observation set must be created by `/quality improve`. |

The remaining stateful prompts were not run because their prerequisites were
not available: they require a completed feature map, a named check, a proof
gap, or a usable observation set. Running them against invented IDs would test
the placeholder rather than the documentation:

- `/quality assess`
- `/quality improve`
- stronger-proof and accepted-gap prompts
- review/ratification follow-ups
- saved-view creation and assessment
- CI observation connection
- external product-source remapping
- `spec-project` lifecycle commands

## Findings to act on

1. **Bootstrap is expensive but bounded.** On a real repository it took 8.6
   minutes; streamed progress made the work observable. Documentation should set
   this expectation for noninteractive runs.
2. **Permission scopes are part of the recipe.** Omitting the narrow `npx`
   allowance caused a real validator gate; adding it unblocked the same prompt.
   Compound shell expansions were also denied, so skills should prefer Read/
   Grep/Glob over shell composition.
3. **MCP isolation should use `--strict-mcp-config`.** It avoids slow project
   MCP startup without disabling skill resolution or modifying project files.
4. **Prompt examples should use placeholders deliberately.** Feature-specific
   examples such as `002-checkout` need an explicit note: substitute a real
   feature ID from `.quality/project-map.yaml`.
5. **Session semantics should be stated in testing guidance.** Follow-up prompts
   should use `--continue`; independent documentation prompts should run in a
   fresh session so they prove persisted files, not conversational memory.

## Verification boundary

This sweep verified prompt routing, scoped noninteractive permissions, MCP
isolation, Sonnet model selection, session persistence, project bootstrap,
feature mapping, and assessment behavior when observations are absent. It did
not run proof-policy, views, CI wiring, risk-acceptance, or `spec-project`
lifecycles end-to-end; those need additional project state and human decisions.
