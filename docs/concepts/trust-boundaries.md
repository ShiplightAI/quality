# How Quality earns your trust

Quality is trustworthy only when the system evaluating evidence cannot quietly
change the evidence, the score, or a decision that belongs to you.

## The guarantees

### Evidence remains independent

Systems that build and test software produce facts and artifacts. Quality reads
and evaluates them; it does not create the tests it assesses or change reported
results. A result source may retrieve an existing observation file, but cannot
reinterpret it or decide whether a verification method passed. New runner
formats must be normalized before evaluation.

### Scores are deterministic

The engine calculates every score from the saved graph, selected scope,
available observations, and recorded human decisions. Agents and the UI can
explain a score, but cannot invent or adjust it. The same inputs produce the
same result, with Quality, Coverage, Evidence confidence, and Structure
confidence kept separate.

### Inspection is read-only and contained

Scanning and assessment views do not change the files being assessed or upload
them. Quality Explorer has no controls that edit or publish changes; it provides
instructions for changes to go through normal review. Its project root is fixed
at process startup, browser requests cannot select another directory, and the
scanner refuses symlinks to artifacts outside that root.

These controls limit local reads, not every network request. A configured remote
source such as GitHub may still retrieve a selected artifact.

Some commands intentionally write output: `analyze` writes generated
recommendations under `.quality/generated/`, and an agent may prepare graph
changes when asked. Those actions are separate from scanning and remain visible
for review.

### Human decisions stay human

Agents may propose features, checks, priorities, or accepted risks. They cannot
validate their own proposals, mark a person's validation complete, or accept
risk on that person's behalf; passing tests are not human validation. Structure
confidence reaches full trust only when a person validates the feature and its
complete set of checks.

## Implementation

These are product guarantees; users should not need to understand the codebase
to rely on them. Contributors can see the enforcing package boundaries and
mechanisms in [Architecture](../../ARCHITECTURE.md).
