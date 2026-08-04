# Shared: Independence — the load-bearing principle

Quality exists because **you cannot verify a system against itself**. When
the same understanding writes the code, writes the tests, and pronounces the result
good, the confidence it reports is circular — *self-verification is not
verification; a system that grades its own homework will always pass.* As code
generation becomes cheap and abundant, the scarce resource is **trust**: does the
software do what it should, and is it correct, with justified confidence?

Quality answers that only if its judgment is independent of whatever produced the
code and the tests. That independence is engineered, not assumed, and it is the
reason Quality is a **separate skill at a higher altitude** than the proof
producers—never one of their commands.

## The four enforcement mechanisms (never weaken these)

1. **One-directional artifact flow.** Producers emit facts (`test-spec.md`,
   `test-report.md`, test code, run results); Quality reads/indexes/scores them.
   Quality **never authors a test or changes the logic that determines a
   result**. When explicitly authorized, it may add mechanical workflow glue
   that serializes and uploads an already-determined result as canonical
   `quality-observations.json`; that glue must not manufacture, reinterpret, or
   force a passing status. Producers never write quality-graph source or touch
   `.quality/`.
2. **The engine scores, never the LLM.** The four scores are computed by the
   deterministic `quality-tools` engine from declared facts + runtime observations
   + human ratification — never an agent's opinion. Never blend, optimize, or
   reverse-engineer a score. A measure of quality must never become the target it
   describes, or it stops describing anything (Goodhart).
3. **The judge re-confirms, never copies the claim.** When a producer records an
   evidence `type`, Quality confirms it against the artifact at `evidence.path`
   rather than trusting the report's self-claim — the judge does not copy the
   generator's label.
4. **Human ratification gate.** Structure confidence is the only human-gated
   axis, ratified through four gates (see below). An agent may **construct at the
   untrusted default and propose** checks/priorities/structure, but must **never
   self-advance a gate** or ratify on the owner's behalf. Self-verification of
   structure is disallowed by design.

## Structure confidence: the ratification gates

Mechanism 4 is enforced through **four ratification gates** — each a separate
field the deterministic `quality-tools` engine reads, never an agent's edit. The
engine composes them into the structure-confidence score; the numbers below are
the current rubric, not a target to optimize toward or reverse-engineer.

| Gate | Field | Artifact / owner | What it ratifies |
| --- | --- | --- | --- |
| 1 | `structure_provenance` | `quality-map.yaml` / `map-feature` | the check list *and its priorities* **originated** from a trusted source — `spec`/`user_authored` = 1.0, `agent_generated` = 0.7, `inferred_brownfield` = 0.4, `unspecified` = 0 (counted, earns no trust). This is *origin*, not review — review is gate 4 and never overwrites it |
| 2 | feature `status` | `project-map.yaml` / `map-project` | the feature is accepted project structure—a `candidate` (agent-proposed, unratified) feature soft-caps its checks' structure confidence at 0.7 until a human ratifies it by assigning the accurate lifecycle status, such as `planned`, `specified`, or `implemented` |
| 3 | `priority_provenance` | `project-map.yaml` / `map-project` | the declared priority is human-set (`human`) rather than agent-guessed (`agent`); the agent must not overwrite a human-set priority on rebuild |
| 4 | `checks_reviewed` | `quality-map.yaml` / `map-feature` | a human reviewed and **approved the whole check list**. Combined with a confirmed feature (gate 2), it lifts that feature's checks to HIGH structure confidence (1.0), overriding the gate-1 provenance ladder. Orthogonal to `structure_provenance` (origin) — `agent_generated` means "an agent produced the checks," *not* "a human reviewed them"; that is what this gate records |

`map-feature` owns gates 1 and 4; `map-project` owns gates 2–3. When either
command says it "owns structure confidence," it means *its* gates—the score is
the engine's join of all four and is never owned end-to-end by one command. An agent may
construct at the untrusted end of every gate (`inferred_brownfield`, `candidate`,
`agent`, `checks_reviewed: false`) and propose, but must never self-advance any gate
on the owner's behalf — including flipping `checks_reviewed` to true or accepting a
gap risk (`accepted_gaps`) for the owner.

## The two human decisions that are *not* gates

Two other fields record a human decision and move a score. Neither touches
structure confidence, so **neither is a ratification gate and neither carries a
gate number** — the four above are the whole list. They are mirror images:

| Field | The human… | Effect |
| --- | --- | --- |
| `policy_override` | **raises** the bar for one check — `require_gate`, `required_modalities`, `required_contexts` | adds `needs_gate` / `required_modalities` / `required_contexts` gap reasons, so coverage and quality can only go **down** |
| `accepted_gaps` | **lowers** the bar, accepting a gap category as tolerated risk | the gap stays visible but stops counting as open, so the score can go **up** |

Both feed the gap reasons in `quality-structure/assessment.ts` and never the
structure-confidence axis. Reporting them beside each other is the point: one
says "this needs more proof than the default", the other says "we know, and we
accept it".

The direction decides what an agent may do. An agent may **propose** either, and
may **tighten** freely — adding a `policy_override` only makes the bar harder to
clear, which cannot manufacture trust. An agent must never **loosen** on the
owner's behalf: writing `accepted_gaps`, or removing or weakening an owner's
`policy_override` (including setting `require_gate: false`), discards a human
decision exactly as self-advancing a gate would.

## Layering rule

Quality may know about and drive the producers (top knows bottom — it can hand a
proof gap to `/shiplight cover` or a producer). The producers must **not** know
about Quality. Keep the dependency one-directional and the file interface the only
coupling.
