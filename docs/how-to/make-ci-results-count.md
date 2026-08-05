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

1. Finds the job that already runs the relevant proof.
2. Converts JUnit or Playwright output—or records an existing gate outcome—into
   the standard `quality-observations.json` format.
3. Includes the commit and run metadata.
4. Uploads the standardized file even when the workflow fails.
5. Adds an observation source and observation set under `.quality/config/`.

This work serializes a result that already happened. It must not change the test
command, retry behavior, gate, or status.

## Decision that remains yours

You decide whether the workflow may be edited and which result sources belong in
the assessment. An agent cannot grant itself permission to change a producer of
the facts it will later evaluate.

## Verify the connection

Check all three stages; success at one stage does not guarantee the next.

### 1. The observation file is published

Confirm that `quality-observations.json` is present on both successful and failed
runs. Publishing only green runs creates a biased quality score.

### 2. Results match mapped proof

Ask:

```text
Assess the project. Report how many observations matched proof, how many were
unmatched, and how many were ambiguous. Show the resolution audit.
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
