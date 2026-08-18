# Correctness terminology

Shiplight Quality uses validation, verification, evidence, and observation for
different relationships. Keeping them separate matters as Quality expands from
empirical testing toward reasoning methods such as static analysis and formal
verification.

## The model

```text
product intent / PRD
        │
        │ intent validation
        ▼
specification and quality claims
        │
        │ verification
        ▼
┌──────────────────────────────┬──────────────────────────────┐
│ reasoning-based verification │ empirical verification       │
│ review and static analysis   │ tests and runtime checks     │
│ argument or formal proof     │ execution and observation    │
└──────────────────────────────┴──────────────────────────────┘
        │
        ▼
evidence → confidence → human decision
```

## Validation

**Validation** asks whether the specification and quality claims accurately
represent product intent: are these the right requirements and expected
behaviors?

In Quality, a person validates the proposed feature boundaries, priorities, and
complete list of checks against the PRD, specification, and other accepted
product sources. The current file format records parts of this decision through
feature status, priority provenance, and `checks_reviewed`.

Validation does not establish that the implementation satisfies a claim. It
establishes that the claim is one the product actually intends to make.

Quality also has a `validate` command that checks a YAML document against the
quality-map contract. Call this **schema validation** when the distinction
matters. Schema validation does not validate product intent.

## Verification

**Verification** asks whether the implementation or observed behavior satisfies
a quality claim. It includes both reasoning-based verification and empirical
verification.

A **verification method** is a repeatable or inspectable way to evaluate that
relationship. Verification can follow two broad paths:

- **Reasoning-based verification** examines the implementation or a model of it.
  Examples include review, static analysis, model checking, and formal
  verification.
- **Empirical verification** executes or monitors the system, records an
  observation, and compares it with the claim. Examples include unit,
  integration, and end-to-end tests, production telemetry, and manual runtime
  procedures.

Formal verification is therefore one specific reasoning-based verification
method. The unqualified word *verification* includes both reasoning and
empirical methods.

## Observation

An **empirical observation** is a recorded fact about executed or production
behavior. Empirical verification compares that observation with a quality claim.

A **runtime observation** is also the name of Quality's standardized result
record. It says that an executable verification method passed, failed, errored,
or was skipped at a particular revision and time. This transport record can
carry the outcome of a reasoning tool such as a static checker. Recording that
outcome does not make the underlying method empirical; the method's evidence
still comes from reasoning about the implementation or its model.

An observation does not support a quality claim merely because it exists. It
must resolve to the relevant verification method and be evaluated against the
expected outcome. Quality keeps the method-to-observation join explicit so a
missing result is not mistaken for a passing one.

## Evidence

**Evidence** is information that supports or challenges a quality claim. It can
come from reasoning or from evaluated observations. Its strength depends on the
method, scope, context, provenance, independence, and current result.

The checked-in quality graph maps each claim to the verification methods and
artifacts expected to provide evidence. Runtime observations then record what
happened when executable methods were evaluated. Evidence confidence describes
the strength of that setup; runtime quality describes the observed outcomes.

## Proof

**Proof** is reserved for a deductive argument that establishes a proposition
under stated assumptions, including a machine-checked formal proof. Tests,
telemetry, and ordinary runtime observations provide empirical evidence; they
are not called proofs in user-facing Quality terminology.

Some current machine-readable names predate this terminology. In particular,
`proof_gap` is the existing quality-map field for an evidence gap. Documentation
may show that literal name when explaining the file format, but prose should use
**evidence gap**. Compatibility names do not define the conceptual vocabulary.

Formal proof is not yet a first-class method type in the current quality-map
contract. Treating one as `static` or `other` would not capture its theorem,
assumptions, proof artifact, or checker. Future formal-verification support
should extend the contract without changing the distinctions on this page.

## Human decisions

Human validation and human approval are related but distinct:

- A person **validates intent** by confirming that features and checks represent
  what the product is meant to do.
- A person **approves a decision** when accepting risk, setting policy, or making
  a release decision.

Quality records these decisions but does not make them. Avoid using
*ratification* as a general synonym for validation; it describes a formal act of
adoption, not the work of comparing claims with product intent.

## Preferred wording

| Avoid | Prefer |
| --- | --- |
| proof definition | verification method or mapped verification method |
| proof artifact | verification artifact or evidence artifact |
| proof type | verification method type or evidence type |
| proof policy / proof requirement | verification policy / verification requirement |
| proof gap | evidence gap (use `proof_gap` only for the literal field) |
| runtime proof | runtime evidence or observed result |
| proof producer | evidence producer |
| ratify a feature or check list | validate the feature or check list |
