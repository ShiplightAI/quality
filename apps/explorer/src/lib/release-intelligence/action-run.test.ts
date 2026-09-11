import { describe, expect, it } from "vitest";
import {
  archiveListingHasUnsafePath,
  parseGitHubRemote,
  resolveActionRunReference,
} from "./action-run";

describe("release action run configuration", () => {
  it("accepts a workflow run URL with an attempt", () => {
    expect(
      resolveActionRunReference(
        "https://github.com/ShiplightAI/shipyard/actions/runs/32042052300/attempts/2",
      ),
    ).toEqual({
      owner: "ShiplightAI",
      repo: "shipyard",
      runId: "32042052300",
      runAttempt: 2,
    });
  });

  it("infers a numeric run's repository from HTTPS or SSH origin", () => {
    expect(resolveActionRunReference("42", "git@github.com:ShiplightAI/shipyard.git")).toEqual({
      owner: "ShiplightAI",
      repo: "shipyard",
      runId: "42",
    });
    expect(parseGitHubRemote("https://github.com/ShiplightAI/quality.git")).toEqual({
      owner: "ShiplightAI",
      repo: "quality",
    });
    expect(parseGitHubRemote("git@github-loggia:ShiplightAI/shipyard.git")).toEqual({
      owner: "ShiplightAI",
      repo: "shipyard",
    });
  });

  it("rejects a numeric run without an attributable GitHub repository", () => {
    expect(() => resolveActionRunReference("42", "https://example.com/repo.git")).toThrow(
      /GitHub origin remote/u,
    );
  });

  it("rejects archive paths and symlink targets that escape the temporary checkout", () => {
    expect(archiveListingHasUnsafePath("safe/file\n", "-rw-r--r-- safe/file\n")).toBe(false);
    expect(archiveListingHasUnsafePath("../outside\n", "-rw-r--r-- ../outside\n")).toBe(true);
    expect(
      archiveListingHasUnsafePath(
        "safe/link\n",
        "lrwxr-xr-x safe/link -> /etc/passwd\n",
      ),
    ).toBe(true);
    expect(
      archiveListingHasUnsafePath(
        "safe/link\n",
        "lrwxr-xr-x safe/link -> ../../outside\n",
      ),
    ).toBe(true);
  });
});
