import { Suspense } from "react";
import { ProjectScanner } from "@shiplightai/quality-ui";
import { resolveScannerProject } from "@/lib/quality-explorer/scanner-project";
import { localProjectsAllowed } from "@/lib/quality-explorer/project";

export default async function ReviewsPage(): Promise<React.ReactElement> {
  const project = await resolveScannerProject();
  return (
    <Suspense fallback={<div className="loading-state" role="status">Loading workspace</div>}>
      <ProjectScanner view="reviews" project={project} localAllowed={localProjectsAllowed()} />
    </Suspense>
  );
}
