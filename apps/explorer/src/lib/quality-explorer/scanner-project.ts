import type { ScannerProject } from "@shiplightai/quality-ui";
import { qualityProjectRoot } from "./project-root";

export type { ScannerProject };

// Host half of the project seam: `@shiplightai/quality-ui` owns the `ScannerProject` shape, each
// host owns how it is resolved. Quality Explorer serves exactly one project — the root the server
// was started with — so resolution is constant. Quality Center resolves a cookie + org membership
// to a connected target instead.
export async function resolveScannerProject(): Promise<ScannerProject> {
  const path = qualityProjectRoot();
  return { kind: "local", path, projectKey: `local:${path}` };
}
