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
| `/quality map-feature <id>` | Define one feature's checks and connect existing proof | [Map a feature](how-to/map-a-feature.md) |
| `/quality assess` | Refresh the available scores and explain them | [The four scores](concepts/the-four-scores.md) |
| `/quality improve` | Diagnose a weak score or gap and address its cause | [Act on a low score](how-to/act-on-a-weak-score.md) |
| `/quality help` | Explain a Quality request without running it | — |

There is no shortcut that approves a proposal or accepts risk. State those
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
| `analyze` | Loads a saved observation set, calculates the available scores, and writes ranked recommendations to JSON |
| `fix-prompts` | Turns structural proof gaps into instructions for a coding agent |
| `observations` | Converts JUnit or Playwright reports, records individual outcomes, merges files, validates them, or prints their schema |
| `schema` | Prints the quality-map JSON Schema |

### Important behavior

**`validate` checks the map contract, not the whole repository.** It checks YAML,
required and unknown fields, identifiers, references, and canonical evidence
paths. It does not check whether a referenced proof file currently exists. A
full project scan reports missing evidence files separately.

**`analyze` requires an observation-set identifier.** It scans the repository,
tries to load the selected result sources, optionally applies a saved view, and
writes a file under `.quality/generated/recommendations/` unless you choose a
different output path. If runtime acquisition fails, the file can still contain
the structural scores calculated from the maps saved with the project.

**`observations` is normally used in CI.** It produces the canonical
`quality-observations.json` file from JUnit, Playwright, or a directly recorded
status. Canonical statuses are `pass`, `fail`, `error`, and `skipped`.

**There is no CLI command that only prints the four scores.** Use `/quality
assess`, open [Quality Explorer](how-to/inspect-in-the-browser.md), or inspect the
JSON file written by `analyze`.

## Common examples

Validate one quality map:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 validate \
  .quality/evidence/checkout/quality-map.yaml
```

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
