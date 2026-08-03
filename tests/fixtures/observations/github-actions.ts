import type { GitHubActionsRunInput } from "@shiplightai/quality-core";

// Trimmed from `gh run view --json databaseId,displayTitle,workflowName,headSha,...,jobs`
// against ShiplightAI/monots release workflows on 2026-06-07 / 2026-06-06.

export const publishCliRunFixture: GitHubActionsRunInput = {
  databaseId: 27092384832,
  displayTitle: "Publish shiplightai CLI",
  workflowName: "Publish shiplightai CLI",
  headSha: "367a89353a3ab9cfebaf0c0a9f70dd86b89a741f",
  status: "completed",
  conclusion: "success",
  createdAt: "2026-06-07T12:20:03Z",
  updatedAt: "2026-06-07T12:27:04Z",
  url: "https://github.com/ShiplightAI/monots/actions/runs/27092384832",
  jobs: [
    {
      name: "publish",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-06-07T12:20:08Z",
      completedAt: "2026-06-07T12:27:03Z",
      url: "https://github.com/ShiplightAI/monots/actions/runs/27092384832/job/79958214423",
      steps: [
        {
          name: "Set up job",
          number: 1,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-07T12:20:09Z",
          completedAt: "2026-06-07T12:20:10Z"
        },
        {
          name: "Build CLI with dependencies",
          number: 10,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-07T12:21:22Z",
          completedAt: "2026-06-07T12:24:13Z"
        },
        {
          name: "Unit + logic tests (hard gate)",
          number: 11,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-07T12:24:13Z",
          completedAt: "2026-06-07T12:24:42Z"
        },
        {
          name: "E2E — example-homepage (hard gate)",
          number: 25,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-07T12:25:58Z",
          completedAt: "2026-06-07T12:26:19Z"
        },
        {
          name: "Upload diagnostic artifacts",
          number: 30,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-07T12:27:00Z",
          completedAt: "2026-06-07T12:27:01Z"
        }
      ]
    }
  ]
};

export const publishMcpRunFixture: GitHubActionsRunInput = {
  databaseId: 27055967858,
  displayTitle: "Publish @shiplightai/mcp",
  workflowName: "Publish @shiplightai/mcp",
  headSha: "ad6e952bd4850620f31decbafeff9a0ffb40e0ff",
  status: "completed",
  conclusion: "success",
  createdAt: "2026-06-06T07:16:01Z",
  updatedAt: "2026-06-06T07:19:57Z",
  url: "https://github.com/ShiplightAI/monots/actions/runs/27055967858",
  jobs: [
    {
      name: "publish",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-06-06T07:16:05Z",
      completedAt: "2026-06-06T07:19:56Z",
      url: "https://github.com/ShiplightAI/monots/actions/runs/27055967858/job/79860324893",
      steps: [
        {
          name: "Set up job",
          number: 1,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-06T07:16:07Z",
          completedAt: "2026-06-06T07:16:10Z"
        },
        {
          name: "Unit tests (hard gate)",
          number: 7,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-06T07:17:29Z",
          completedAt: "2026-06-06T07:19:07Z"
        },
        {
          name: "Build MCP server with dependencies",
          number: 11,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-06T07:19:08Z",
          completedAt: "2026-06-06T07:19:11Z"
        },
        {
          name: "Functional smoke (--version / --help / --chrome-extension-path)",
          number: 19,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-06T07:19:37Z",
          completedAt: "2026-06-06T07:19:40Z"
        },
        {
          name: "Upload diagnostic artifacts",
          number: 23,
          status: "completed",
          conclusion: "success",
          startedAt: "2026-06-06T07:19:51Z",
          completedAt: "2026-06-06T07:19:52Z"
        }
      ]
    }
  ]
};
