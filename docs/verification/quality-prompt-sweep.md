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

- A plain `claude -p` invocation was treated as a new session; deliberate
  follow-ups used `--resume <session-id>` so they could not attach to an
  unrelated recent session.
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
| Assessment without observations | `/quality assess` | Fresh | **Pass at the time; now superseded.** It refused to manufacture four scores and explained that `.quality/config/` and an observation set must be created by `/quality improve`. See the note below. |

The last row recorded a defect as a pass. `analyze` rejected the command without
`--observation-set`, so the skill reported every score as unavailable even though
coverage, evidence confidence, and structure confidence need no runtime results.
`analyze` now accepts a run without an observation set, and the expected behavior
for this scenario is to report those three scores and explain that Quality alone
is unavailable. This scenario needs rerunning against the fixed CLI.

## Expanded documentation-example sweep

The second pass exercised every executable, user-facing Quality prompt pattern
in `README.md` and `docs/**/*.md`. Conceptual names such as payments and admin
export were replaced with real feature and check ids from the generated graph.
Mutation-heavy prompts ran in a disposable clone. Follow-ups that rely on prior
language used the same Claude session; persisted-state checks used fresh ones.

| Example group | Result |
| --- | --- |
| Scoped bootstrap | **Pass with inconsistent provenance.** `/quality start, focus on the highest-risk user-facing workflow first` selected 001 with a defensible risk explanation and completed in about 11.5 minutes. Unlike the first bootstrap, it marked spec-backed features `candidate` and the map `agent_generated`; that conflicts with the spec-driven rules and the earlier run's `implemented`/`spec` result. |
| Exact and natural feature mapping | **Pass.** Both `/quality map-feature 002-recorder-session-upload` and the natural-language recorder-upload example routed correctly, validated the map, and exposed real gaps. |
| Help, status, and project mapping | **Pass.** `/quality help`, `/quality status`, and `/quality map-project` honored their read/write boundaries and reported persisted state. |
| Stronger proof policy | **Pass with an interpretation defect.** A real check accepted an e2e modality requirement, then a release-CI context requirement. The follow-up correctly found both unmet, but incorrectly said `require_gate` was also unmet: the engine treats existing `pr-ci` evidence as a gate, while `required_contexts: ["release-ci"]` expresses the narrower release requirement. |
| Accept and withdraw a gap | **Pass.** Explicit owner language added `missing` to `accepted_gaps`; the follow-up removed it without changing proof or test results. |
| Review and ratification | **Pass with response defects.** The review prompt prioritized pending human decisions. Explicit approval changed only `priority_provenance` and `checks_reviewed`, but the response said “three checks” and listed seven, and it added a reviewer email not supplied in the prompt. |
| Diagnose weak scores | **Routes correctly, explanation needs correction.** Coverage diagnosis chose the unmapped shipped P1 feature as the smallest honest improvement. Evidence-confidence diagnosis mixed structure review into the evidence axis and used incorrect check totals. |
| Resolution audit without observations | **Pass with incorrect totals.** It correctly explained that no resolution audit exists before runtime acquisition and separated missing proof from join failure, but its category counts did not match its own lists. |
| Saved view | **Pass.** The agent created a two-feature view with exact ids. Assessment then hit the known published-CLI requirement for an observation set; the static-assessment fix is tracked separately. |
| CI observation connection | **Pass after real prerequisite repair.** The skill stopped at the producer boundary, required explicit CI authorization, preserved test semantics, emitted canonical observations, and created the smallest source/set. Local JUnit verification exposed broken graph join keys before configuration was written. |
| Assessment before the new CI artifact exists | **Pass.** GitHub acquisition found the latest real run, reported the missing artifact, returned `0` matched/unmatched/ambiguous observations, preserved the three static scores, and left Quality unavailable. |
| External product sources | **Pass.** Linear and Jira sources were recorded as human-selected but reported unavailable without inventing content. A GitHub URL resolving to the already-indexed local PRD was not duplicated. The follow-up accurately reported which sources were used and what changed. |

The disagreement example in `review-and-ratify.md` was not executed literally:
it asserts that feature 002 is a folder and should merge into 001, which is
false for this repository. Its underlying correction/ratification path was
covered by the other human-decision scenarios. `spec-project` prompts and shell
CLI examples are outside this Quality-prompt sweep.

## Product and skill defects found

1. **Spec-driven bootstrap is nondeterministic.** Two clean starts over the same
   accepted specifications produced different lifecycle and structure
   provenance (`implemented`/`spec` versus `candidate`/`agent_generated`). The
   latter contradicts the skill: `candidate` is the brownfield default, while
   checks derived from accepted specifications use `spec` provenance.
2. **Generated evidence did not join real Vitest output.** Local JUnit conversion
   showed 57 of 57 pinned rows unmatched because the maps stored bare test labels
   while Vitest emits the full nested name. Three rows also cited the wrong test
   file. Mechanical repairs raised a local runtime score from 31 to 77, proving
   that the join keys—not the test results—caused most of the loss.
3. **Pinned and unpinned rows can become ambiguous.** After repairing the exact
   pins, 46 observations matched both a pinned row and an unpinned row for the
   same file. The mapping workflow needs to audit overlap before calling runtime
   wiring complete.
4. **Narrative counts are unreliable.** Several responses stated totals that did
   not match their own lists. Score explanations should derive counts from parsed
   graph/engine output instead of prose bookkeeping.
5. **Score axes were mixed.** One evidence-confidence explanation cited
   `checks_reviewed: false`, which belongs to structure confidence. Explanations
   must group causes by the score they affect.
6. **Policy explanations diverged from engine semantics.** The agent treated
   `require_gate` as “release gate,” even though the engine recognizes `pr-ci`
   as a gate. The separate `required_contexts` field is what requires
   `release-ci`; explanations should evaluate each override independently.
7. **Identity was inferred unnecessarily.** Human-gate edits added a reviewer
   email from local context even though the prompt supplied no identity. Record
   the decision without inventing attribution unless the human states it.

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
4. **Prompt examples should use placeholders deliberately.** Resolved in this
   pass: the README now uses a natural-language risk focus, and the feature guide
   tells readers to substitute an id from `.quality/project-map.yaml`.
5. **Session semantics should be stated in testing guidance.** Follow-up prompts
   should use an explicit `--resume <session-id>`; independent documentation
   prompts should run in a fresh session so they prove persisted files, not
   conversational memory.

## Verification boundary

This sweep verified Quality prompt routing, scoped noninteractive permissions,
session persistence, bootstrap, mapping, human gates, proof policy, saved views,
CI wiring, runtime acquisition failure, resolution reporting, and external
source handling. It did not verify `spec-project`, development commands, or
external tracker retrieval because no Linear/Jira connector was available.
