# @shiplightai/quality-tools

Tools for producing canonical workflow observations, assessing repository
quality graphs, and generating fix prompts.

These examples require `@shiplightai/quality-tools` 0.3.0. Pin the interface so
an unpublished or stale `latest` tag cannot silently run 0.2.x:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 observations --help
```

Inside this source checkout, use
`pnpm exec tsx packages/quality-tools/src/cli.ts` in place of the pinned `npx`
prefix until 0.3.0 is published.

## Produce workflow observations

Each selected workflow artifact contains a `quality-observations.json` file.
A workflow may publish several selected artifacts, all using this same
contract. Convert a native test report at the producer boundary:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 observations from-junit reports/junit.xml \
  --output quality-observations.json
```

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 observations from-playwright reports/playwright.json \
  --output quality-observations.json
```

`GITHUB_SHA`, `GITHUB_REF_NAME`, and `GITHUB_RUN_ID` supply workflow metadata
automatically. For a smoke or release gate:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 observations record \
  --path .github/workflows/publish.yml \
  --test-case tarball-size \
  --status pass \
  --output quality-observations.json
```

Merge independently produced shards and validate before upload:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 observations merge shard-*.json \
  --output quality-observations.json
npx --yes @shiplightai/quality-tools@^0.3.0 observations validate quality-observations.json
```

Print the canonical schema with:

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 observations schema
```

Observation sources only locate this canonical file. They do not select report
parsers.

## Analyze runtime quality

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 analyze \
  --project-path . \
  --observation-set release-workflows-runtime-review \
  --view web
```

The command scans the target repository, executes the selected observation set,
applies the optional saved view, and writes recommendation JSON under
`.quality/generated/recommendations/`.

## Generate fix prompts

```bash
npx --yes @shiplightai/quality-tools@^0.3.0 fix-prompts \
  --project-path . \
  --output .quality/fix-prompts.md
```

Use `--format json` when another tool or agent consumes the output.
