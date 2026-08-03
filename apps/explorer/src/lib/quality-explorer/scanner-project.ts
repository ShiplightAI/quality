import { qualityProjectRoot } from "./project-root";

export type ScannerProject =
  | { readonly kind: "hosted"; readonly projectKey: string }
  | { readonly kind: "local"; readonly path: string; readonly projectKey: string }
  | { readonly kind: "none" };

export async function resolveScannerProject(): Promise<ScannerProject> {
  const path = qualityProjectRoot();
  return { kind: "local", path, projectKey: `local:${path}` };
}
