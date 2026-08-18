# Commands

You can use Quality in two ways: ask a coding agent in plain language, or run the
command-line tool directly. Most people will use the agent for setup and changes,
then use the command line in CI or automation.

## Ask an agent

The `quality` agent skill recognizes these shortcuts. You can also describe the
same outcome in your own words.

| Request | What it does | Learn more |
| --- | --- | --- |
| `/quality start` | Set up the smallest useful quality graph | [Set up Quality](how-to/set-up-quality.md) |
| `/quality status` | Describe the current graph and saved results without changing anything | — |
| `/quality map-project` | Create or update the project and feature list | — |
| `/quality map-feature <id>` | Define one feature's checks and connect existing verification methods | [Map a feature](how-to/map-a-feature.md) |
| `/quality assess` | Refresh the available scores and explain them | [The four scores](concepts/the-four-scores.md) |
| `/quality improve` | Diagnose a weak score or gap and address its cause | [Act on a low score](how-to/act-on-a-weak-score.md) |
| `/quality help` | Explain a Quality request without running it | — |

There is no shortcut that validates a proposal or accepts risk. State those
decisions in your own words so the agent can record exactly what you decided.
See [Who decides what](concepts/who-decides-what.md).

## Run the command-line tool

Run the published tool without installing it globally:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 <command>
```

The `^0.3.0` range uses the compatible 0.3 release line. Add `--help` after any
command to see all options.

| Command | What it does |
| --- | --- |
| `validate` | Validates one feature quality map and exits with an error code when the map is invalid |
| `analyze` | Calculates the available scores, optionally loads a saved observation set, and writes the result and any ranked recommendations to JSON |
| `fix-prompts` | Turns structural evidence gaps into instructions for a coding agent |
| `observations` | Converts JUnit or Playwright reports, records individual outcomes, merges files, validates them, or prints their schema |
| `schema` | Prints the quality-map JSON Schema |

### Important behavior

**`validate` checks the map contract, not the whole repository.** It checks YAML,
required and unknown fields, identifiers, references, and canonical evidence
paths. It does not check whether a referenced verification artifact currently
exists. A full project scan reports missing evidence files separately.

**`analyze` needs an observation-set identifier only for the Quality score.** It
scans the repository, optionally applies a saved view, and writes a file under
`.quality/generated/recommendations/` unless you choose a different output path.
Coverage, evidence confidence, and structure confidence are calculated from the
maps saved with the project, so the file reports them whether or not runtime
results were loaded.

Pass `--observation-set` to also load runtime results and calculate the Quality
score. Leave it out and the command still writes the three static scores, to
`static--<scope>.json`. The `quality_score_availability` field in the file says
whether the Quality score is present and, when it is not, why: `not_requested`
when no observation set was selected, `unavailable` when acquisition or
resolution failed.

**`observations` is normally used in CI.** It produces the canonical
`quality-observations.json` file from JUnit, Playwright, or a directly recorded
status. Canonical statuses are `pass`, `fail`, `error`, and `skipped`.

**No CLI command prints the four scores to the terminal.** `analyze` writes them
to JSON. Use `/quality assess` for an explanation, open
[Quality Explorer](how-to/inspect-in-the-browser.md), or inspect the file written
by `analyze`.

## Common examples

Validate one quality map:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 validate \
  .quality/evidence/checkout/quality-map.yaml
```

Report the three static scores, without any runtime results:

```bash
pnpm exec tsx packages/quality-tools/src/cli.ts analyze \
  --project-path .
```

That static-only form is available in this source checkout. Before using it with
the pinned `npx` command, inspect `analyze --help`: older published 0.3.x
versions describe `--observation-set` as required and reject the omission.

Assess the whole project with a saved observation set:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 analyze \
  --project-path . \
  --observation-set release-results
```

Assess one saved view:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 analyze \
  --project-path . \
  --observation-set release-results \
  --view checkout-release
```

Convert a JUnit report in CI:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 observations from-junit \
  reports/junit.xml \
  --output quality-observations.json
```

The observation command needs a commit identifier. In GitHub Actions it uses
`GITHUB_SHA` automatically; elsewhere, pass `--commit <sha>`.
