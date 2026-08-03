interface GlossaryItem {
  readonly term: string;
  readonly definition: string;
}

const observationTerms: readonly GlossaryItem[] = [
  {
    term: "Observation set",
    definition:
      "A saved group of observation sources you run together. Running a set pulls observations onto the structural maps."
  },
  {
    term: "Observation source",
    definition:
      "One place runtime test results come from, such as a GitHub workflow or a local folder of test results."
  },
  {
    term: "Observation",
    definition:
      "A concrete result attached to one evidence item, such as pass, fail, partial, skipped, or unobserved."
  },
  {
    term: "Latest observed",
    definition:
      "The newest timestamp Quality Explorer found for the selected evidence or check in the currently loaded observation set."
  },
  {
    term: "Run id",
    definition:
      "The upstream workflow run or local bundle identifier that produced the loaded observations."
  }
];

const evidenceTerms: readonly GlossaryItem[] = [
  {
    term: "Quality check",
    definition:
      "One feature expectation that Quality Explorer evaluates. Checks roll up structural evidence and loaded observations."
  },
  {
    term: "Evidence mapped",
    definition:
      "How many structural evidence items are attached to a quality check."
  },
  {
    term: "Unit",
    definition:
      "Evidence backed by a unit-level automated test that exercises one module or behavior in isolation."
  },
  {
    term: "Integration",
    definition:
      "Evidence backed by a test that exercises multiple modules, services, or seams together."
  },
  {
    term: "E2E",
    definition:
      "Evidence backed by a full end-to-end user or system flow."
  },
  {
    term: "Contract",
    definition:
      "Evidence backed by interface, schema, or compatibility validation at a boundary."
  },
  {
    term: "Script",
    definition:
      "Evidence backed by a scripted command or verification step rather than a named test suite."
  },
  {
    term: "Static",
    definition:
      "Evidence backed by static analysis, configuration inspection, or source review."
  },
  {
    term: "Automated proof",
    definition:
      "The proof tier for an automated test (unit, contract, integration, e2e, or agent): automated, repeatable proof of the behavior."
  },
  {
    term: "Manual proof",
    definition:
      "The proof tier for a human-observed test: real proof, but not automatically repeatable."
  },
  {
    term: "Supporting proof",
    definition:
      "The proof tier for static, smoke, or telemetry evidence: indirect or supporting proof rather than direct execution."
  }
];

const gapTerms: readonly GlossaryItem[] = [
  {
    term: "Gap",
    definition:
      "A recorded place where a quality check still lacks enough proof or enough trustworthy proof."
  },
  {
    term: "Weak evidence",
    definition:
      "A gap where some evidence exists, but the proof is not automated enough, not gated, or not complete enough."
  },
  {
    term: "Release blocker",
    definition:
      "A gap serious enough that the current quality model treats it as blocking release readiness."
  },
  {
    term: "Copy fix prompt",
    definition:
      "A generated prompt you can hand to another agent to improve proof coverage for that specific gap."
  }
];

function GlossarySection({
  id,
  title,
  intro,
  items
}: {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly items: readonly GlossaryItem[];
}): React.ReactElement {
  return (
    <section className="score-help-section" id={id} aria-labelledby={`${id}-heading`}>
      <div className="score-help-section-header">
        <h2 id={`${id}-heading`}>{title}</h2>
        <p>{intro}</p>
      </div>
      <div className="score-help-glossary-grid">
        {items.map((item) => (
          <article className="score-help-card" key={item.term}>
            <h3>{item.term}</h3>
            <p>{item.definition}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ScoringHelpPage(): React.ReactElement {
  return (
    <div className="score-help-page">
      <header className="score-help-header">
        <div>
          <h1>How scoring works</h1>
          <p>
            Quality Explorer uses structural quality checks, runtime observations, and
            saved observation sets. This page explains the terms that appear across
            the workspace and how the main scores are calculated.
          </p>
        </div>
      </header>

      <nav className="score-help-nav" aria-label="Glossary sections">
        <a href="#scores">Scores</a>
        <a href="#observations">Observations</a>
        <a href="#evidence">Evidence and proof</a>
        <a href="#states">Statuses</a>
        <a href="#gaps">Gaps and prompts</a>
      </nav>

      <section className="score-help-section" id="scores" aria-labelledby="scores-heading">
        <div className="score-help-section-header">
          <h2 id="scores-heading">Scores</h2>
          <p>
            Quality Explorer shows one final observation-backed score and three
            structural scores. They answer different questions.
          </p>
        </div>
        <div className="score-help-grid" aria-label="Score definitions">
          <article className="score-help-card">
          <h2>Quality score</h2>
          <p>
            Quality score is the final observation-backed score for the currently loaded
            observation set. It stays unavailable until Quality Explorer runs a saved
            observation set and evaluates those observations against the current
            structural maps.
          </p>
          <pre className="formula-block">
            <code>{`quality_score =
  sum(check_weight × quality_points(observed_state))
  / sum(check_weight)
  × 100`}</code>
          </pre>
          <p>
            The observed expectation state contributes these points:
          </p>
          <table className="score-help-table">
            <thead>
              <tr>
                <th>Observed state</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>PASS</td><td>1.00</td></tr>
              <tr><td>PARTIAL</td><td>0.70</td></tr>
              <tr><td>SKIPPED</td><td>0.00</td></tr>
              <tr><td>UNOBSERVED</td><td>0.00</td></tr>
              <tr><td>FAIL or ERROR</td><td>0.00</td></tr>
            </tbody>
          </table>
          </article>

          <article className="score-help-card">
          <h2>Coverage</h2>
          <p>
            Structural coverage measures how much of the project&apos;s weighted quality checks
            are backed by mapped evidence definitions. It is about proof design coverage, not
            whether the product is ready to ship right now.
          </p>
          <pre className="formula-block">
            <code>{`coverage_score =
  sum(check_weight × coverage_points(coverage_status))
  / sum(check_weight)
  × 100`}</code>
          </pre>
          <table className="score-help-table">
            <thead>
              <tr>
                <th>Coverage status</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>COVERED or PASS</td><td>1.00</td></tr>
              <tr><td>PARTIAL</td><td>0.60</td></tr>
              <tr><td>IMPLICIT</td><td>0.50</td></tr>
              <tr><td>MANUAL</td><td>0.40</td></tr>
              <tr><td>DEFERRED</td><td>0.25</td></tr>
              <tr><td>Missing or unavailable</td><td>0.00</td></tr>
            </tbody>
          </table>
          </article>

          <article className="score-help-card">
          <h2>Evidence confidence</h2>
          <p>
            Evidence confidence measures how trustworthy the proof is. It
            evaluates the strength and completeness of the checked-in proof graph, not the
            runtime quality of the product itself. It does not say whether the map asks the
            right questions &mdash; that is structure confidence.
          </p>
          <pre className="formula-block">
            <code>{`evidence_confidence =
  sum(check_weight × evidence_confidence_points)
  / sum(check_weight)
  × 100`}</code>
          </pre>
          <p>
            A check&apos;s evidence confidence is derived from the <code>type</code> of its mapped
            tests, not from any declared depth or reliability field:
          </p>
          <table className="score-help-table">
            <thead>
              <tr>
                <th>Evidence confidence</th>
                <th>When it applies</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>HIGH</td><td>An automated test (unit, contract, integration, e2e, or agent) running in a gate context (ci, pr-ci, or staging-gate), or two or more distinct automated types.</td></tr>
              <tr><td>MEDIUM</td><td>At least one automated test, but single and un-gated.</td></tr>
              <tr><td>LOW</td><td>Only manual, static, smoke, or telemetry evidence, or no evidence at all.</td></tr>
            </tbody>
          </table>
          <p>
            Those tiers contribute confidence points:
          </p>
          <table className="score-help-table">
            <thead>
              <tr>
                <th>Evidence confidence</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>HIGH</td><td>1.00</td></tr>
              <tr><td>MEDIUM</td><td>0.70</td></tr>
              <tr><td>LOW</td><td>0.35</td></tr>
              <tr><td>UNKNOWN</td><td>0.00</td></tr>
            </tbody>
          </table>
          </article>

          <article className="score-help-card">
          <h2>Structure confidence</h2>
          <p>
            Structure confidence measures how trustworthy the <em>structure</em> is &mdash;
            whether its set of quality checks can be relied on &mdash; based on where each check
            came from. It is orthogonal to evidence confidence: a feature can have strong
            evidence (high evidence confidence) on a structure that was inferred from existing code and
            never verified (low structure confidence). The two are always shown side by side, never
            blended.
          </p>
          <p>
            Each check records its <em>origin</em> in <code>structure_provenance</code> &mdash; where it came
            from (spec, agent-drafted, inferred from code, or human-authored). The origin is a permanent
            fact: it is shown verbatim as the check&apos;s badge and is never overwritten, so an inferred
            check stays &ldquo;inferred from code&rdquo; even after a person signs off on it.
          </p>
          <p>
            Human opinion comes first. A check counts as <strong>HIGH</strong> (1.00) &mdash; regardless of
            origin &mdash; once two human gates are cleared: the feature is confirmed on the Features
            &amp; priorities page (gate 2) <em>and</em> its check list is reviewed and approved on the
            feature page (gate 4). Human review can confer trust an origin alone never earns. Until both
            gates are cleared, a check falls back to the trust its origin justifies (the table below); an
            <code> unspecified</code> origin scores 0 and is still counted in the denominator.
          </p>
          <pre className="formula-block">
            <code>{`structure_confidence =
  sum(structureWeight × structure_confidence_points)
  / sum(structureWeight)
  × 100`}</code>
          </pre>
          <p>
            <code>structureWeight</code> is a check&apos;s priority weight, or 0 for a feature with no
            quality checks (excluded from both sides). Every check that <em>does</em> have quality checks
            counts, including <code>unspecified</code> ones (they contribute 0). The
            <code> structure_confidence_points</code> are 1.00 when reviewed; otherwise the origin points below.
          </p>
          <table className="score-help-table">
            <thead>
              <tr>
                <th>origin (unreviewed)</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>spec, user_authored</td><td>1.00</td></tr>
              <tr><td>agent_generated</td><td>0.70</td></tr>
              <tr><td>inferred_brownfield</td><td>0.40</td></tr>
              <tr><td>unspecified</td><td>0.00</td></tr>
              <tr><td><em>any origin, reviewed</em></td><td>1.00</td></tr>
            </tbody>
          </table>
          </article>

          <article className="score-help-card">
          <h2>Weights and missing maps</h2>
          <p>
            All four scores are priority-weighted. There is no separate risk weight: each
            check&apos;s weight comes directly from its declared <code>priority</code>.
          </p>
          <table className="score-help-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>P0</td><td>5</td></tr>
              <tr><td>P1</td><td>3</td></tr>
              <tr><td>P2</td><td>2</td></tr>
              <tr><td>Other or unspecified</td><td>1</td></tr>
            </tbody>
          </table>
          <p>
            If the project structure references a feature but no canonical quality checks are found,
            Quality Explorer adds a zero-point penalty for that feature in the coverage and evidence
            confidence rollups. That lowers coverage and evidence confidence until canonical evidence
            exists. Structure confidence excludes those features instead, since a feature with no checks
            has no recorded source to trust or distrust.
          </p>
          </article>
        </div>
      </section>

      <GlossarySection
        id="observations"
        title="Observations and review flow"
        intro="These terms explain the observation path in the Observations panel and the quality-check overlays."
        items={observationTerms}
      />

      <GlossarySection
        id="evidence"
        title="Evidence and proof"
        intro="These terms describe the structural proof graph attached to each quality check."
        items={evidenceTerms}
      />

      <section className="score-help-section" id="states" aria-labelledby="states-heading">
        <div className="score-help-section-header">
          <h2 id="states-heading">Statuses</h2>
          <p>
            Coverage and observation are separate axes. Coverage is structural;
            observation comes from the currently loaded observation set.
          </p>
        </div>
        <div className="score-help-grid">
          <article className="score-help-card">
            <h3>Coverage statuses</h3>
            <table className="score-help-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Covered</td><td>The check has strong mapped structural evidence.</td></tr>
                <tr><td>Partial</td><td>The check has some evidence, but automated proof or completeness is still lacking.</td></tr>
                <tr><td>Implicit</td><td>The check is supported indirectly rather than by a direct mapped proof path.</td></tr>
                <tr><td>Manual</td><td>The check still depends on manual verification.</td></tr>
                <tr><td>Deferred</td><td>The check is acknowledged, but proof work has been intentionally pushed later.</td></tr>
              </tbody>
            </table>
          </article>

          <article className="score-help-card">
            <h3>Observation statuses</h3>
            <table className="score-help-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Pass</td><td>All selected observations for the check resolved successfully.</td></tr>
                <tr><td>Partial</td><td>Some mapped evidence was observed, but the full set is mixed or incomplete.</td></tr>
                <tr><td>Unobserved</td><td>No matching observation was loaded for the check in the current observation set.</td></tr>
                <tr><td>Skipped</td><td>Observations were found, but all of them were skipped.</td></tr>
                <tr><td>Fail</td><td>At least one mapped observation failed.</td></tr>
                <tr><td>Error</td><td>At least one mapped observation errored before a clean result was produced.</td></tr>
              </tbody>
            </table>
          </article>
        </div>
      </section>

      <GlossarySection
        id="gaps"
        title="Gaps and prompts"
        intro="These terms explain what still needs attention when a check is not fully proven."
        items={gapTerms}
      />
    </div>
  );
}
