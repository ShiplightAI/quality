import { createReadStream, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { requireQcSession } from "@/lib/quality-explorer/require-session";
import { problemResponse as problem } from "@/lib/quality-explorer/route-problem";
import { qualityProjectRoot } from "@/lib/quality-explorer/project-root";

export const runtime = "nodejs";

// Serves a run-evidence file out of the opened project so a reviewer can open
// the report the producer already wrote.
//
// The path is in the URL rather than a query parameter on purpose. A Playwright
// HTML report inlines its own summary but fetches attachments from a sibling
// `data/` directory using RELATIVE urls, so the report only works if its own
// address has the same shape as its folder — `.../evidence-file/report/index.html`
// resolves `data/x.webm` to `.../evidence-file/report/data/x.webm`, while a
// `?ref=` query would resolve it against the route and 404.
//
// Trust boundary: this serves files from the local project the user themselves
// opened, on a loopback-bound single-user dev server, and only the extensions
// below. `requireQcSession` is a no-op in Quality Explorer, so LOOPBACK IS THE
// ONLY BOUNDARY: served behind `--hostname 0.0.0.0`, or port-forwarded out of a
// container, this becomes a read-the-project endpoint for anyone who can reach
// it. A host that binds anywhere else must put real authentication in front of
// this route. It is not a general static file server — an unlisted extension is
// refused rather than guessed at, which is what keeps a checked-in `.command`
// or `.sh` in a scanned repo from ever being handed to a browser.
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

// `.js` and `.css` are here because a report is a web page that needs its own
// assets: Playwright's trace viewer ships as `trace/*.js` and `trace/*.css`
// beside the report, and dropping them would leave the trace — the most useful
// evidence a run produces — unopenable.
//
// The cost, accepted knowingly: any `.js` anywhere in the scanned project is
// reachable through this route as same-origin script, and the document CSP
// allows `script-src 'self'`, so a hostile report could load it. Serving them
// as downloads instead would break the viewer, and confining them to a report
// subdirectory would need configuration the profile does not carry. The
// boundary stays the one above — a project you would run tests from — and this
// is the sharpest edge of it.
const MAX_BYTES = 512 * 1024 * 1024;

// Served HTML and SVG come from a scanned repo, which is not a trusted author,
// and they run on this application's own origin — so without a policy they
// could call its API and post what they read to a remote host.
//
// `sandbox` is NOT the answer here: an opaque origin turns the report's own
// sibling requests into cross-origin ones, breaking the trace and video that
// are the whole point, and the CORS header needed to restore them would open
// this local file server to every site the viewer has open.
//
// So the origin is kept and the cheap exfiltration routes are cut instead.
// `'self'` lets the report load its own assets and fetch its own `data/`
// directory, while every remote destination for fetch, XHR, beacon, image,
// script and form post is refused. `unsafe-inline`/`unsafe-eval` are required
// by the report's own bundle, and withholding them would only break honest
// reports.
//
// This is a reduction, NOT containment, and the difference matters: CSP cannot
// stop a top-level navigation, since the `navigate-to` directive that would
// have was dropped from the spec. A hostile page in a scanned repo can still
// read what this origin serves and then put it in a URL it navigates to.
// Closing that needs a separate origin for evidence, which one loopback dev
// server cannot provide — so the real boundary remains "only open a project you
// would run tests from".
const DOCUMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // `'self'`, not `'none'`: Playwright's trace viewer replays a captured page
  // by framing it, so refusing frames outright would blank every snapshot pane
  // in the viewer this route allows `.js` in order to serve. Remote framing
  // stays blocked, which is the part that carries a URL somewhere else.
  "frame-src 'self'",
  "worker-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'"
].join("; ");

const SCRIPTABLE_TYPES = new Set([".html", ".htm", ".svg"]);

// `relative === ".."` or a leading `../` segment. A prefix test would also
// reject a contained directory literally named `..cache`, whose relative path
// starts with two dots but never leaves the root.
function escapesRoot(relative: string): boolean {
  // `""` means the request resolved to the project root itself. Downstream the
  // extension lookup and the isFile() check both refuse it, but containment
  // should not depend on guards that follow it — reorder those and the hole
  // opens silently.
  return (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ ref: readonly string[] }> },
): Promise<Response> {
  const unauthorized = await requireQcSession();
  if (unauthorized) return unauthorized;

  const { ref } = await context.params;
  if (!Array.isArray(ref) || ref.length === 0) {
    return problem(400, "invalid-evidence-ref", "An evidence file path is required.");
  }

  const projectRoot = qualityProjectRoot();
  // Segments are used AS GIVEN. Next has already percent-decoded each one, so
  // decoding again is not a no-op on a name that legitimately contains `%`: a
  // Playwright artifact folder named after a test title like `100% progress`
  // arrives correctly decoded and a second pass throws, while a file actually
  // named `a%20b.png` silently resolves to `a b.png` — a different file.
  const relative = ref.join("/");

  // Containment, not sanitisation: resolve first, then require the result to sit
  // under the project root. Stripping `..` textually misses encoded forms;
  // comparing the resolved path does not.
  //
  // `path.resolve` is purely lexical, so it is not enough on its own: a repo
  // containing `report -> /Users/someone` would pass a lexical check and then
  // serve files from outside the project. Both the real path AND the project
  // root are realpath'd before comparison, so a symlinked checkout still
  // resolves against its own real location rather than failing spuriously.
  const resolved = path.resolve(projectRoot, relative);
  let realResolved: string;
  let realRoot: string;
  try {
    realRoot = realpathSync(projectRoot);
    realResolved = realpathSync(resolved);
  } catch {
    return problem(404, "evidence-ref-not-found", "That evidence file could not be read.");
  }

  const contained = path.relative(realRoot, realResolved);
  if (escapesRoot(contained)) {
    return problem(403, "evidence-ref-outside-project", "That path is outside the opened project.");
  }

  const contentType = CONTENT_TYPES[path.extname(realResolved).toLowerCase()];
  if (contentType === undefined) {
    return problem(
      415,
      "evidence-ref-unsupported-type",
      "Quality Explorer does not serve that file type as run evidence.",
    );
  }

  let size: number;
  try {
    const stats = statSync(realResolved);
    if (!stats.isFile()) {
      return problem(404, "evidence-ref-not-found", "That evidence file could not be read.");
    }
    size = stats.size;
  } catch {
    return problem(404, "evidence-ref-not-found", "That evidence file could not be read.");
  }

  if (size > MAX_BYTES) {
    return problem(413, "evidence-ref-too-large", "That evidence file is too large to serve.");
  }

  const stream = Readable.toWeb(createReadStream(realResolved)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      // The declared type is the one that was matched from the extension, so
      // sniffing could only ever disagree with it.
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      ...(SCRIPTABLE_TYPES.has(path.extname(realResolved).toLowerCase())
        ? { "content-security-policy": DOCUMENT_CSP }
        : {}),
    },
  });
}
