import { Suspense } from "react";
import { ViewsManager } from "@shiplightai/quality-ui";
import { resolveScannerProject } from "@/lib/quality-explorer/scanner-project";

export default async function ViewsPage(): Promise<React.ReactElement> {
  const project = await resolveScannerProject();
  const projectPath = project.kind === "local" ? project.path : "";

  return (
    <div className="app-shell">
      <Suspense fallback={<div className="loading-state" role="status">Loading views</div>}>
        <ViewsManager projectPath={projectPath} projectKey={project.kind === "none" ? null : project.projectKey} />
      </Suspense>
    </div>
  );
}
