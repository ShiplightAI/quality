// Copy-to-agent instructions (spec 045, read-only QC). The QC web UI authors nothing;
// for every change it emits a plain-language instruction the viewer pastes into their
// coding agent, which makes the `.quality/**` edit via the `quality` skill and opens a
// PR. These builders produce those instructions — the target (feature id, check id,
// category, value) is named explicitly so the agent can act without more context.

const SKILL = "Using the Shiplight `quality` skill";

/** Accept a gap on a check as tolerated risk (adds the category to `accepted_gaps`). */
export function acceptRiskInstruction(input: {
  readonly feature: string;
  readonly checkTitle: string;
  readonly checkId: string;
  readonly category: string;
}): string {
  return (
    `${SKILL}, record the "${input.category}" gap on check "${input.checkTitle}" ` +
    `(id ${input.checkId}) in feature "${input.feature}" as accepted, tolerated risk: ` +
    `add "${input.category}" to that check's \`accepted_gaps\` in the feature's ` +
    `\`.quality/evidence/**/quality-map.yaml\`, then open a PR. This is a human decision — ` +
    `only record it because I have accepted the risk.`
  );
}

/** Un-accept a previously accepted gap (removes the category from `accepted_gaps`). */
export function unacceptRiskInstruction(input: {
  readonly feature: string;
  readonly checkTitle: string;
  readonly checkId: string;
  readonly category: string;
}): string {
  return (
    `${SKILL}, un-accept the "${input.category}" gap on check "${input.checkTitle}" ` +
    `(id ${input.checkId}) in feature "${input.feature}": remove "${input.category}" from ` +
    `that check's \`accepted_gaps\` in the feature's quality map, then open a PR.`
  );
}

/** Set the check's proof policy (`require_gate` — "Catch regressions in CI"). */
export function setProofPolicyInstruction(input: {
  readonly feature: string;
  readonly checkTitle: string;
  readonly checkId: string;
  readonly requireGate: boolean;
}): string {
  return (
    `${SKILL}, set \`policy_override.require_gate: ${input.requireGate}\` on check ` +
    `"${input.checkTitle}" (id ${input.checkId}) in feature "${input.feature}" — require its ` +
    `proof to run in CI / a release gate so a break is caught automatically. Edit the feature's ` +
    `quality map and open a PR.`
  );
}

/** Add a check a human wants that the agent missed. */
export function addCheckInstruction(input: {
  readonly feature: string;
  readonly title: string;
  readonly priority: string;
}): string {
  return (
    `${SKILL}, add a quality check "${input.title}" (priority ${input.priority}) to feature ` +
    `"${input.feature}": add the expectation to the feature's quality map with an honest ` +
    `\`structure_provenance\` (\`user_authored\` since I am requesting it), then open a PR.`
  );
}

/** Remove a check that doesn't belong. */
export function removeCheckInstruction(input: {
  readonly feature: string;
  readonly checkTitle: string;
  readonly checkId: string;
}): string {
  return (
    `${SKILL}, remove the quality check "${input.checkTitle}" (id ${input.checkId}) from feature ` +
    `"${input.feature}": delete that expectation from the feature's quality map, then open a PR.`
  );
}

/** Approve the check list (map-level `checks_reviewed`, gate 4 — human review). */
export function approveCheckListInstruction(input: { readonly feature: string }): string {
  return (
    `${SKILL}, mark feature "${input.feature}"'s check list as human-reviewed: set map-level ` +
    `\`checks_reviewed: true\` in the feature's quality map, then open a PR. Only do this because ` +
    `I have reviewed and approved the checks — it lifts the feature's structure confidence.`
  );
}

// --- Runtime observation wiring & saved views (spec 045). These artifacts live under
// `.quality/config/**` and are repo-owned like the quality maps. REMOVING a specific one is a
// targeted copy-to-agent instruction (below). ADDING one is open-ended — the wiring is best authored
// in conversation with the `/quality improve` command — so the UI points the user there rather
// than parameterizing a one-shot instruction; there is deliberately no add* builder here.

/** Remove a runtime observation source, and any set reference to it. */
export function removeObservationSourceInstruction(input: { readonly name: string; readonly id: string }): string {
  return (
    `${SKILL}, remove the observation source "${input.name}" (id ${input.id}) from ` +
    `\`.quality/config/observation-sources.yaml\`, and drop any reference to it in ` +
    `\`.quality/config/observation-sets.yaml\`, then open a PR.`
  );
}

/** Remove an observation set. */
export function removeObservationSetInstruction(input: { readonly name: string; readonly id: string }): string {
  return (
    `${SKILL}, remove the observation set "${input.name}" (id ${input.id}) from ` +
    `\`.quality/config/observation-sets.yaml\`, then open a PR.`
  );
}

// Adding a saved view is not a copy-to-agent instruction: a view is an open-ended slice best
// authored in conversation with the `/quality improve` command (which validates feature ids
// against the project map), so the UI points the user there instead of parameterizing a one-shot
// instruction by a typed name. Removal stays a targeted copy-to-agent instruction.

/** Remove a saved QC view. */
export function removeViewInstruction(input: { readonly name: string; readonly id: string }): string {
  return (
    `${SKILL}, remove the saved view "${input.name}" (id ${input.id}) from ` +
    `\`.quality/config/views.yaml\`, then open a PR.`
  );
}
