# Make CI results count

**Outcome:** Existing CI results become runtime observations that can contribute
to the quality score for the exact commit that produced them.

**Use this when:** At least one feature is mapped and you want runtime quality to
reflect actual test runs.

## Ask your agent

```text
Connect our existing CI test results to Quality in its standard observation format. Add
the smallest observation source and observation set needed to load them.
```

Changing a CI workflow requires explicit permission. If you want the agent to
make that mechanical edit, say so:

```text
You may edit .github/workflows/ci.yml only to convert and upload the results the
workflow already produces. Do not change which tests run or how pass and fail
are decided.
```

Without that permission, the agent should propose the workflow change and stop.

## What the agent does

1. Finds the job that already runs the relevant verification method.
2. Converts JUnit or Playwright output—or records an existing gate outcome—into
   the standard `quality-observations.json` format.
3. Includes the commit and run metadata.
4. Uploads the standardized file even when the workflow fails.
5. Adds an observation source and observation set under `.quality/config/`.

This work serializes a result that already happened. It must not change the test
command, retry behavior, gate, or status.

## Link the run evidence (optional)

Requires a `quality-tools` newer than 0.3.2. Until that ships, the published
validator rejects the field.

A result can carry a pointer to what the run left behind, so a reviewer opening
a check can see what the test actually did rather than only whether it passed:

```json
{
  "path": "tests/e2e/checkout.test.yaml",
  "test_case": "guest can pay",
  "status": "pass",
  "artifacts": [
    { "ref": "https://app.example.test/runs/8412?test=99231", "label": "Run 8412" }
  ]
}
```

Point at the report a person already knows how to read — the run page, the HTML
report the runner wrote. Quality links to it and stops there; it is an index
from checks to evidence, not a viewer, and it will not enumerate videos and
screenshots for you.

`ref` is opaque: Quality records and displays it, and never parses or resolves
it. An absolute `http(s)` ref is linked as it stands. Anything else is read as a
path inside the project, which only a reader holding that project can open — so
a local report path shows as a link in Quality Explorer and as plain text in a
hosted reader.

This is additive. A result without it counts exactly the same; only the link is
missing. And a malformed pointer never costs you the result it was attached to:
it is reported and dropped, and the observed status stands.

Do not confuse these with the workflow artifacts that carry the canonical file
itself. These are pointers inside it.

## Decision that remains yours

You decide whether the workflow may be edited and which result sources belong in
the assessment. An agent cannot grant itself permission to change a producer of
the facts it will later evaluate.

## Verify the connection

Check all three stages; success at one stage does not guarantee the next.

### 1. The observation file is published

Confirm that `quality-observations.json` is present on both successful and failed
runs. Publishing only green runs creates a biased quality score.

### 2. Results match mapped verification methods

Ask:

```text
Assess the project. Report how many observations matched mapped verification
methods, how many were unmatched, and how many were ambiguous. Show the
resolution audit.
```

Matching uses the evidence path and optional test-case name. Results arriving in
Quality is not the same as results contributing to a check.

### 3. Runtime quality becomes available

Run the observation set. The quality score should become available when the set
and its mapped targets can be evaluated. Individual checks with no matching
result remain unobserved and receive no runtime credit.

## Troubleshooting

**Results arrive but do not match.** Compare the reported path and test-case name
with the quality map. Paths are normalized and can match by repository-relative
suffix; test-case matching is case-insensitive and whitespace-trimmed.

**Only successful runs publish observations.** Configure the upload step to run
after failures as well. Otherwise the assessment sees a selected sample of
reality.

**One job publishes only part of the result.** Merge compatible observation
files from the same commit and run, or publish all expected artifacts. Do not
treat a partial result set as complete.

**Quality cannot reach GitHub Actions.** A GitHub Actions source needs the
configured token and access to the repository and workflow. Missing credentials
should produce an explicit diagnostic, not an empty success.

**The observation file has no commit.** The standard format requires one. In
GitHub Actions the command uses `GITHUB_SHA`; elsewhere pass `--commit <sha>`.
