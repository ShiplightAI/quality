// How a run-evidence ref becomes something a viewer can open. One place,
// because two surfaces render refs — the feature page's proof column and the
// join audit panel — and a rule that lives in both diverges: they would start
// disagreeing about which refs are links, which is the sort of difference
// nobody notices until a reviewer reports a dead one.
//
// The engine never interprets a ref. This is the single point where the UI
// looks at one at all, and it looks only at whether the producer already gave
// us something a browser can open, or whether the host can turn a project path
// into something it can.

export function isAbsoluteEvidenceUrl(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

/**
 * The URL to open for a ref, or `undefined` when it must render as text.
 *
 * A project path is passed through as PATH SEGMENTS rather than a query
 * parameter: the reports these refs point at fetch their own video and trace
 * with relative urls, so the served page has to sit at the same shape of
 * address as the folder it came from, or those resolve to nothing.
 *
 * A host that cannot serve project files gets `undefined` rather than a link,
 * because a hosted reader with no local checkout has nothing behind it.
 */
export function evidenceRefHref(
  ref: string,
  qcApi: (path: string) => string,
  servesEvidenceFiles: boolean
): string | undefined {
  if (isAbsoluteEvidenceUrl(ref)) {
    return ref;
  }

  if (!servesEvidenceFiles) {
    return undefined;
  }

  const segments = ref
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));
  return segments.length === 0 ? undefined : qcApi(`/evidence-file/${segments.join("/")}`);
}

/**
 * What to show beside the link. Refs are written by evidence producers, so the
 * destination is shown rather than hidden behind a label the producer also
 * chose. A project-relative ref shows its path instead: the host it resolves to
 * is this application, which tells the reader nothing.
 */
export function evidenceRefDestination(ref: string): string {
  if (!isAbsoluteEvidenceUrl(ref)) {
    return ref;
  }

  try {
    return new URL(ref).host;
  } catch {
    return ref;
  }
}
