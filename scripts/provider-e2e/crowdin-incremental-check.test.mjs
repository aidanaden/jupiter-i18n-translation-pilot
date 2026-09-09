import { readFileSync } from "node:fs";

import { expect, test } from "vitest";
import { parse } from "yaml";

import { checkScope, runIncrementalCheck } from "./crowdin-incremental-check.mjs";
import { incrementalScope } from "./crowdin-incremental-delivery.mjs";

function fixture() {
  const repository = incrementalScope.repository;
  const env = {
    GITHUB_EVENT_NAME: "push",
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: checkScope.taskRef,
    GITHUB_WORKFLOW_REF: `${repository}/${checkScope.workflow}@${checkScope.taskRef}`,
    GITHUB_SHA: "1".repeat(40),
    GITHUB_RUN_ID: "123",
    GH_TOKEN: "test-only-token",
    RUNNER_TEMP: "/tmp/test-only",
  };
  const completed = {
    head_sha: incrementalScope.candidateSha,
    status: "completed",
    conclusion: "success",
  };
  const data = {
    [`/pulls/32`]: {
      number: 32,
      state: "open",
      draft: false,
      base: {
        ref: incrementalScope.baseBranch,
        sha: "old-metadata-is-not-the-live-ref",
        repo: { full_name: repository },
      },
      head: {
        ref: checkScope.headBranch,
        sha: incrementalScope.candidateSha,
        repo: { full_name: repository },
      },
    },
    [`/git/ref/heads/${incrementalScope.baseBranch}`]: { object: { sha: checkScope.baseSha } },
    [`/actions/runs/${checkScope.runId}`]: {
      ...completed,
      id: checkScope.runId,
      run_attempt: 1,
      head_branch: checkScope.headBranch,
      path: ".github/workflows/ci.yml",
      event: "pull_request",
      check_suite_id: checkScope.suiteId,
    },
    [`/actions/jobs/${checkScope.jobId}`]: {
      ...completed,
      id: checkScope.jobId,
      run_id: checkScope.runId,
      name: "verify",
      check_run_url: `https://api.github.com/repos/${repository}/check-runs/${checkScope.jobId}`,
    },
    [`/check-runs/${checkScope.jobId}`]: {
      ...completed,
      id: checkScope.jobId,
      name: "verify",
      app: { id: 15368 },
      check_suite: { id: checkScope.suiteId },
    },
  };
  const receipt = {
    status: "candidate-verified",
    repository,
    baseBranch: incrementalScope.baseBranch,
    baseSha: checkScope.baseSha,
    headSha: incrementalScope.candidateSha,
    preservedMessages: 12,
    humanApprovalProved: false,
    reviewerDisclosure: incrementalScope.reviewerDisclosure,
    checkedAt: "2026-09-10T00:00:00Z",
  };
  const calls = [];
  let nativeCalls = 0;
  const options = {
    env,
    now: () => Date.parse("2026-09-10T00:00:01Z"),
    runCommand: (name, args) => {
      calls.push({ name, args });
      if (name === "git" && args.join(" ") === "rev-parse HEAD") return env.GITHUB_SHA;
      if (name === "git" && args[0] === "fetch") return "";
      if (name === "gh" && args.includes("POST")) return "{}";
      const response = data[args[1].replace(`repos/${repository}`, "")];
      if (!response) throw new Error("Unexpected request");
      return JSON.stringify(response);
    },
    verifyCandidate: async (args) => {
      nativeCalls++;
      expect(args).toEqual([
        "verify",
        "/tmp/test-only/crowdin-incremental-verified",
        incrementalScope.candidateSha,
      ]);
      return receipt;
    },
  };
  return { options, env, data, receipt, calls, nativeCalls: () => nativeCalls };
}

test("only publishes pending then success for the pinned candidate after native verification", async () => {
  const f = fixture();
  await runIncrementalCheck(f.options);
  expect(f.nativeCalls()).toBe(1);
  const posts = f.calls.filter(({ args }) => args.includes("POST"));
  expect(posts.map(({ args }) => args.find((arg) => arg.startsWith("state=")))).toEqual([
    "state=pending",
    "state=success",
  ]);
  for (const { args } of posts) {
    expect(args[1]).toBe(
      `repos/${incrementalScope.repository}/statuses/${incrementalScope.candidateSha}`,
    );
    expect(args).toContain("context=crowdin-ai-delivery");
  }
  expect(f.calls.find(({ name, args }) => name === "git" && args[0] === "fetch").args).toEqual([
    "fetch",
    "--no-tags",
    `https://github.com/${incrementalScope.repository}.git`,
    incrementalScope.candidateSha,
  ]);
});

test.each([
  [
    "event",
    (f) => {
      f.env.GITHUB_EVENT_NAME = "pull_request_target";
    },
  ],
  [
    "repository",
    (f) => {
      f.env.GITHUB_REPOSITORY = "other/repo";
    },
  ],
  [
    "workflow",
    (f) => {
      f.env.GITHUB_WORKFLOW_REF = "untrusted";
    },
  ],
  [
    "task branch",
    (f) => {
      f.env.GITHUB_REF = "refs/heads/main";
    },
  ],
  [
    "PR head",
    (f) => {
      f.data["/pulls/32"].head.sha = "2".repeat(40);
    },
  ],
  [
    "PR base",
    (f) => {
      f.data["/pulls/32"].base.ref = "main";
    },
  ],
  [
    "fork",
    (f) => {
      f.data["/pulls/32"].head.repo.full_name = "other/repo";
    },
  ],
  [
    "closed PR",
    (f) => {
      f.data["/pulls/32"].state = "closed";
    },
  ],
  [
    "draft PR",
    (f) => {
      f.data["/pulls/32"].draft = true;
    },
  ],
  [
    "base ref drift",
    (f) => {
      f.data[`/git/ref/heads/${incrementalScope.baseBranch}`].object.sha = "3".repeat(40);
    },
  ],
  [
    "CI failure",
    (f) => {
      f.data[`/actions/runs/${checkScope.runId}`].conclusion = "failure";
    },
  ],
  [
    "CI retry",
    (f) => {
      f.data[`/actions/runs/${checkScope.runId}`].run_attempt = 2;
    },
  ],
  [
    "wrong CI workflow",
    (f) => {
      f.data[`/actions/runs/${checkScope.runId}`].path = "other.yml";
    },
  ],
  [
    "wrong CI head",
    (f) => {
      f.data[`/actions/jobs/${checkScope.jobId}`].head_sha = "4".repeat(40);
    },
  ],
  [
    "wrong app",
    (f) => {
      f.data[`/check-runs/${checkScope.jobId}`].app.id = 1;
    },
  ],
  [
    "wrong receipt head",
    (f) => {
      f.receipt.headSha = "5".repeat(40);
    },
  ],
  [
    "wrong receipt base",
    (f) => {
      f.receipt.baseSha = "5".repeat(40);
    },
  ],
  [
    "wrong preserved count",
    (f) => {
      f.receipt.preservedMessages = 11;
    },
  ],
  [
    "false human review",
    (f) => {
      f.receipt.humanApprovalProved = true;
    },
  ],
  [
    "stale receipt",
    (f) => {
      f.options.now = () => Date.parse("2026-09-10T00:02:00Z");
    },
  ],
  [
    "native failure",
    (f) => {
      f.options.verifyCandidate = async () => {
        throw new Error("Native failure");
      };
    },
  ],
  [
    "PR changes during native check",
    (f) => {
      const verify = f.options.verifyCandidate;
      f.options.verifyCandidate = async (args) => {
        const result = await verify(args);
        f.data["/pulls/32"].head.sha = "6".repeat(40);
        return result;
      };
    },
  ],
])("does not publish success for %s", async (_, mutate) => {
  const f = fixture();
  mutate(f);
  await expect(runIncrementalCheck(f.options)).rejects.toThrow();
  expect(f.calls.some(({ args }) => args.includes("state=success"))).toBe(false);
});

test("workflow isolates trusted code, native access, and the exact-head status", () => {
  const workflow = parse(readFileSync(checkScope.workflow, "utf8"));
  expect(workflow.on).toEqual({
    push: { branches: ["aidan/crowdin-incremental-delivery-20260910"] },
  });
  expect(workflow.permissions).toEqual({
    contents: "read",
    "pull-requests": "read",
    actions: "read",
    checks: "read",
    statuses: "write",
  });
  const steps = workflow.jobs["verify-candidate"].steps;
  expect(steps[0].with).toEqual({
    ref: "${{ github.sha }}",
    "fetch-depth": 0,
    "persist-credentials": false,
  });
  expect(steps.filter((step) => step.run).map((step) => step.run)).toEqual([
    "pnpm install --frozen-lockfile --ignore-scripts",
    "node scripts/provider-e2e/crowdin-incremental-check.mjs",
  ]);
});
