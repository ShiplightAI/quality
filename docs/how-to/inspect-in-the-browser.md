# Use Quality Explorer

**Outcome:** A local web view of the project's features, checks, verification
methods, evidence, results, and gaps.

**Use this when:** You want to understand the project without reading YAML, walk
through risk in a review meeting, or inspect why a result did not connect to a
check.

## Start Quality Explorer

From the Shiplight Quality repository, provide the absolute path of the project
you want to inspect:

```bash
QUALITY_PROJECT_ROOT=/absolute/path/to/your/project \
  pnpm --filter @shiplightai/quality-explorer dev
```

Then open <http://127.0.0.1:4173/quality-explorer>.

The selected path must be an existing, readable directory. A `.quality/` folder
is not required for the scanner to open the project: it can also find supported
`specs/*/test-spec.md` and `test-report.md` files. However, the canonical project
graph and all four score workflows require the `.quality/` setup described in
[Set up Quality](set-up-quality.md).

## What you can do

Quality Explorer can:

- Scan the selected project and show its feature and evidence graph.
- Display available structural scores and runtime quality.
- Show checks, gaps, source files, and evidence relationships.
- Load configured observation sources or sets.
- Show matched, unmatched, and ambiguous runtime results.
- Generate text instructions that you can give to a coding agent.

## Bind it to loopback only

Quality Explorer has no sign-in: it is a single-user local tool, and the
loopback address is the whole access boundary. It serves run-evidence files out
of the opened project — reports, videos, traces — to any caller that can reach
it.

Do not run it with `--hostname 0.0.0.0`, and do not port-forward it out of a
container or put it behind a reverse proxy. Doing either turns it into an
endpoint that hands the opened project's files to anyone on the network. A
deployment that needs to be reachable must put real authentication in front of
it.

## Read-only boundaries

Quality Explorer does not edit the selected repository. Actions such as
approving checks, accepting risk, or changing saved configuration produce text
for your coding agent instead of writing files.

The project path is fixed when the server process starts. Browser requests
cannot make the local server inspect another directory.

The development server binds to `127.0.0.1:4173`, so it listens only on your
machine by default. Running a configured GitHub Actions observation source can
still make an outbound request and may require a token; “read-only” does not mean
“offline.”

## Decisions that remain yours

The interface can show an unvalidated feature or list of checks, proposed
policy, or accepted-risk option. It cannot make those decisions for you. See
[Who decides what](../concepts/who-decides-what.md).

## Verify the result

- The page names the project directory selected at startup.
- The feature list matches `.quality/project-map.yaml`, when present.
- Structural and runtime sections clearly show unavailable information rather
  than replacing it with a guessed score.
- Re-running the scan reflects recent file changes.

## Troubleshooting

**The page is empty.** Confirm that the selected directory exists and contains
supported `.quality/` or `specs/*/test-*` artifacts. A project with no supported
artifacts can still be scanned, but there is nothing to display yet.

**The page shows old information.** Re-scan after your agent changes files on
disk.

**Scores differ from another assessment.** Compare the selected feature view,
observation set, revision, and run. Different scopes or results legitimately
produce different answers. See [Scope an assessment](scope-an-assessment.md).

**A result did not count.** Open the observation audit and compare its path and
test-case name with the evidence entry in the quality map.
