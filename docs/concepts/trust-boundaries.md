# How Quality earns your trust

Quality is useful only if the system judging the proof cannot quietly change the
proof, the score, or a decision that belongs to you. The guarantees below define
those boundaries from a user's point of view.

## Proof remains independent

The systems that build and test your software produce facts and artifacts.
Quality reads and evaluates them; it does not create the tests it assesses or
change the results they report.

A result source may locate and retrieve an existing observation file. It cannot
reinterpret the result or decide whether the proof passed. Support for a new test
runner must normalize its output before evaluation, so the runner's report
format cannot change how an existing result is scored.

## Scores are deterministic

The scoring engine calculates every score from the saved quality graph, the
selected scope, the available observations, and recorded human decisions. An
agent and the user interface can explain a score, but neither can invent one or
adjust it by opinion.

Given the same inputs, the engine produces the same result. Coverage, evidence
confidence, structure confidence, and current test results remain separate so a
strong result in one area cannot conceal a weakness in another.

## Read-only inspection

Scanning a project and producing assessment views do not change the files being
assessed or upload them. Quality Explorer is also read-only: it has no controls
that edit or publish changes to the project it displays. When a change is
needed, it provides instructions that you can give to an agent and review through
your normal version-control process.

Some commands are intentionally authoring commands. For example, `analyze`
writes generated recommendations under `.quality/generated/`, and an agent may
prepare changes to the quality graph when you ask it to. Those actions are
separate from scanning and viewing, and their changes remain visible for review.

## The selected project stays contained

Quality Explorer fixes the project root when its process starts. A browser
request cannot select a different directory. The local scanner also refuses to
follow a symbolic link to an artifact outside the selected project.

These controls limit which local files the Explorer and scanner can read. They
do not mean that every possible evidence source is offline: a configured remote
source, such as GitHub, may make the network request needed to retrieve the
artifact you selected.

## Human decisions stay human

An agent may propose features, checks, priorities, or that a risk be accepted.
It cannot approve its own proposal, mark a person's review as complete, or
accept risk on a person's behalf. Passing tests also do not count as human
approval.

Quality records the origin of proposed structure separately from explicit human
review. Structure confidence reaches full trust only after both required human
decisions are recorded: the feature is confirmed and its complete set of checks
is reviewed.

## How the repository enforces these guarantees

These are product guarantees: users should be able to rely on them without
understanding the codebase. Contributors can read
[Architecture](../../ARCHITECTURE.md) to see the package boundaries and
implementation mechanisms that enforce them.
