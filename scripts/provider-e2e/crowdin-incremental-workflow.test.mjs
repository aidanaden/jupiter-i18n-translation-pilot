import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, test } from "vitest";
import { parse } from "yaml";

test("the evidence job reads only on the isolated branch and cannot publish delivery status", () => {
  const workflow = parse(
    readFileSync(".github/workflows/crowdin-incremental-evidence.yml", "utf8"),
  );
  expect(workflow.on).toEqual({
    push: { branches: ["aidan/crowdin-incremental-delivery-20260910"] },
  });
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(Object.keys(workflow.jobs)).toEqual(["collect"]);
  const job = workflow.jobs.collect;
  expect(job.if).toBe(
    "github.repository == 'aidanaden/jupiter-i18n-translation-pilot' && github.ref == 'refs/heads/aidan/crowdin-incremental-delivery-20260910'",
  );
  expect(job.steps[0].with).toEqual({
    ref: "${{ github.sha }}",
    "fetch-depth": 0,
    "persist-credentials": false,
  });
  expect(job.steps.filter((step) => step.run).map((step) => step.run)).toEqual([
    "pnpm install --frozen-lockfile --ignore-scripts",
    'node scripts/provider-e2e/crowdin-incremental-cli.mjs prepare "$RUNNER_TEMP/crowdin-incremental-evidence"',
  ]);
  expect(job.steps.find((step) => step.env).env).toEqual({
    CROWDIN_PERSONAL_TOKEN: "${{ secrets.CROWDIN_AI_RECORDING_TOKEN }}",
    GH_TOKEN: "${{ github.token }}",
  });
});

test.each([
  { GITHUB_EVENT_NAME: "pull_request_target" },
  { GITHUB_REPOSITORY: "other/repo" },
  { GITHUB_REF: "refs/heads/main" },
  { GITHUB_SHA: "0".repeat(40) },
])("CLI rejects an untrusted workflow before reading credentials: %j", (override) => {
  expect(() =>
    execFileSync(
      process.execPath,
      [
        "scripts/provider-e2e/crowdin-incremental-cli.mjs",
        "prepare",
        "/tmp/crowdin-evidence-must-not-exist",
      ],
      {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "push",
          GITHUB_REPOSITORY: "aidanaden/jupiter-i18n-translation-pilot",
          GITHUB_REF: "refs/heads/aidan/crowdin-incremental-delivery-20260910",
          GITHUB_SHA: "0".repeat(40),
          ...override,
        },
        stdio: "pipe",
      },
    ),
  ).toThrow();
});
