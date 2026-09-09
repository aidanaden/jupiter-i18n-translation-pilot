import { readFileSync } from "node:fs";

import { afterEach, expect, test, vi } from "vitest";
import { parse } from "yaml";

import { runIncrementalCli } from "./crowdin-incremental-cli.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

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
])("CLI rejects an untrusted workflow before reading credentials: %j", async (override) => {
  for (const [name, value] of Object.entries({
    GITHUB_EVENT_NAME: "push",
    GITHUB_REPOSITORY: "aidanaden/jupiter-i18n-translation-pilot",
    GITHUB_REF: "refs/heads/aidan/crowdin-incremental-delivery-20260910",
    GITHUB_SHA: "1".repeat(40),
    ...override,
  }))
    vi.stubEnv(name, value);
  const calls = [];
  const runCommand = (command, args) => {
    calls.push(command);
    if (command === "git" && JSON.stringify(args) === JSON.stringify(["rev-parse", "HEAD"]))
      return "1".repeat(40);
    throw new Error("Unexpected external command");
  };
  await expect(
    runIncrementalCli(["prepare", "/tmp/crowdin-evidence-must-not-exist"], { runCommand }),
  ).rejects.toThrow(
    override.GITHUB_SHA ? "Wrong trusted workflow checkout" : "Unapproved workflow context",
  );
  expect(calls.every((command) => command === "git")).toBe(true);
});
