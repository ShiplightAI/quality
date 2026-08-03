export const cliBrowserJunitFixture = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testcase name="create command scaffolds a runnable project" time="0.011" classname="test" file="/home/runner/work/monots/monots/apps/cli/src/commands/create.e2e.test.ts" />
  <testcase name="test command propagates failure exit code" time="0.009" classname="test" file="/home/runner/work/monots/monots/apps/cli/src/commands/test-run.e2e.test.ts" />
  <testcase name="test command passes variable overrides into fixture context" time="0.008" classname="test" file="/home/runner/work/monots/monots/apps/cli/src/commands/test.vars.e2e.test.ts" />
</testsuites>
`;

export const mcpBrowserJunitFixture = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testcase name="browser tools drive a real page" time="0.015" classname="test" file="/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts" />
  <testcase name="sessions stay isolated across concurrent pages" time="0.010" classname="test" file="/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts" />
  <testcase name="console and network logs are captured" time="0.006" classname="test" file="/home/runner/work/monots/monots/packages/mcp-tools/browser-tests/browserTools.behavior.test.ts" />
</testsuites>
`;

export const cliExampleHomepagePlaywrightJsonFixture = JSON.stringify(
  {
    config: {
      version: "1.60.0"
    },
    suites: [
      {
        title: "example-homepage.yaml.spec.ts",
        file: "tests/examples/example-homepage.yaml.spec.ts",
        specs: [
          {
            title: "Release-gate smoke renders the example homepage",
            file: "tests/examples/example-homepage.yaml.spec.ts",
            tests: [
              {
                projectId: "",
                projectName: "",
                results: [
                  {
                    status: "passed",
                    duration: 1250,
                    startTime: "2026-06-07T12:25:58.000Z",
                    attachments: [
                      {
                        name: "shiplight-results",
                        contentType: "application/json",
                        path: "test-results/2026-06-07T12-25-58-000/test-results.json"
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            title: "Release-gate smoke exports the Shiplight report bundle",
            file: "tests/examples/example-homepage.yaml.spec.ts",
            tests: [
              {
                projectId: "",
                projectName: "",
                results: [
                  {
                    status: "passed",
                    duration: 840,
                    startTime: "2026-06-07T12:26:05.000Z",
                    attachments: [
                      {
                        name: "report-data",
                        contentType: "application/json",
                        path: "shiplight-report/2026-06-07T12-25-58-000/report-data.json"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    errors: [],
    stats: {
      startTime: "2026-06-07T12:25:58.000Z",
      duration: 7250,
      expected: 2,
      skipped: 0,
      unexpected: 0,
      flaky: 0
    }
  },
  null,
  2
);
