import { Suspense } from "react";
import { FeaturePage } from "@/components/quality-explorer/FeaturePage";
import { resolveScannerProject } from "@/lib/quality-explorer/scanner-project";

interface FeatureRouteProps {
  // `feature` identifies the resource and stays in the URL; the project comes from the cookie.
  readonly searchParams: Promise<{ readonly feature?: string }>;
}

export default async function FeatureRoute({ searchParams }: FeatureRouteProps): Promise<React.ReactElement> {
  const params = await searchParams;
  const project = await resolveScannerProject();
  const projectPath = project.kind === "local" ? project.path : "";

  return (
    <div className="app-shell">
      <Suspense fallback={<div className="loading-state" role="status">Loading feature</div>}>
        <FeaturePage
          projectPath={projectPath}
          projectKey={project.kind === "none" ? null : project.projectKey}
          featureId={params.feature ?? ""}
        />
      </Suspense>
    </div>
  );
}
