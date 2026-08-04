# `@shiplightai/quality-ui`

Shared React/Mantine presentation for Quality Explorer and Shiplight Quality
Center.

This package receives data through an injected read client. It must not depend
on local filesystem access, GitHub credentials, authentication, organizations,
billing, or other Shiplight platform services.

## Why it exists

The two hosts previously kept byte-identical copies of these components — 20 of
26 were identical, along with the stylesheet and most of the `lib/` helpers. The
copies drifted: each host hardcoded its own route and API prefixes
(`/api/quality-explorer/scan` vs `/api/quality-center/scan`), so a route deleted
in one host left a live `fetch` in the other that 404s **silently**, because
`fetch` does not reject on 404. Injecting the prefixes turns that class of
mismatch into a type error at the composition root.

## Using it

The host owns auth, data access, and project resolution; this package owns
everything rendered. Mount both providers once, in the route layout:

```tsx
import { QcScanCacheProvider, QcUiHostProvider, type QcUiHost } from "@shiplightai/quality-ui";
import { setQcProjectAction } from "./_actions/project";
import "@shiplightai/quality-ui/styles.css";

const host: QcUiHost = {
  routeBase: "/quality-explorer",      // page prefix, no trailing slash
  apiBase: "/api/quality-explorer",    // API prefix, no trailing slash
  setProject: setQcProjectAction,      // Server Action persisting the selection
};

export default function Layout({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="qc-app">
      <QcUiHostProvider host={host}>
        <QcScanCacheProvider>{children}</QcScanCacheProvider>
      </QcUiHostProvider>
    </div>
  );
}
```

Pages then resolve their own `ScannerProject` (host-specific — a fixed root in
Quality Explorer, a cookie plus org membership in Quality Center) and pass it in:

```tsx
const project = await resolveScannerProject();
return <ProjectScanner view="explorer" project={project} localAllowed={localProjectsAllowed()} />;
```

Rendering any component outside `QcUiHostProvider` throws by design — that guard
is what stops a host from mounting the UI without wiring its prefixes.

## Packaging

Published as **TypeScript source**, not a bundle: 19 of the 26 components carry
`"use client"`, and a bundled build would have to re-emit those directives per
chunk. Consumers add it to `transpilePackages` and compile it like first-party
code:

```ts
// next.config.ts
transpilePackages: ["@shiplightai/quality-ui"]
```

`@mantine/core`, `lucide-react`, `next`, `react`, and `react-dom` are peer
dependencies so the host controls their versions.

## Tests

Component tests live beside their components here. They render through
`src/testing.tsx`, which wraps the host provider — import `render` from there
rather than from `@testing-library/react`. `testing.tsx` is deliberately not
exported from the package entrypoint (it pulls in a devDependency).
