import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, it, vi } from "vitest";
import { parse } from "yaml";

import {
  repairScope,
  runRepairException,
  verifyRepairException,
} from "./crowdin-ai-repair-exception.mjs";

const git = (...args) =>
  execFileSync("git", args, { cwd: new URL("../../", import.meta.url), encoding: "utf8" });
const tree = (ref, oid) => ({
  sha: oid,
  truncated: false,
  tree: git("ls-tree", "-rz", ref)
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const [meta, path] = record.split("\t");
      const [mode, type, sha] = meta.split(" ");
      return { path, mode, type, sha };
    }),
});
const taskSha = "a".repeat(40);
const pr = {
  number: 27,
  state: "open",
  draft: false,
  head: {
    ref: "aidan/crowdin-ai-base-test-repair",
    sha: "e5abbe987f62c509630e6659def648bdad64ae9a",
    repo: { full_name: repairScope.repository },
  },
  base: {
    ref: "aidan/provider-e2e-crowdin-ai-base",
    sha: "e317c1d76b0a813954c0f46063047f8f15f1942c",
    repo: { full_name: repairScope.repository },
  },
};
const input = {
  event: {
    repository: { full_name: repairScope.repository },
    ref: repairScope.taskRef,
    after: taskSha,
    head_commit: { id: taskSha },
    forced: false,
    deleted: false,
  },
  trustedHead: taskSha,
  pr,
  baseTree: tree(repairScope.baseSha, "d1c1b3f02e09fadbba55c79831e14c8bd7065819"),
  headTree: tree(repairScope.headSha, "c52b31b71d29ceeace3f800970e1e57094cc1469"),
  blob: {
    sha: "6486f6ced8e2f20f0f391f6365267d2127f506ac",
    size: 2268,
    encoding: "base64",
    content: Buffer.from(
      git("show", `${repairScope.headSha}:scripts/ssr-workflow.test.mjs`),
    ).toString("base64"),
  },
  run: {
    id: 34293094835,
    head_sha: repairScope.headSha,
    event: "pull_request",
    head_branch: "aidan/crowdin-ai-base-test-repair",
    status: "completed",
    conclusion: "success",
    path: ".github/workflows/ci.yml",
    check_suite_id: 92899598072,
  },
  job: {
    id: 102283723386,
    run_id: 34293094835,
    head_sha: repairScope.headSha,
    name: "verify",
    status: "completed",
    conclusion: "success",
    check_run_url: `https://api.github.com/repos/${repairScope.repository}/check-runs/102283723386`,
  },
  check: {
    id: 102283723386,
    head_sha: repairScope.headSha,
    name: "verify",
    status: "completed",
    conclusion: "success",
    app: { id: 15368 },
    check_suite: { id: 92899598072 },
  },
};

it("allows only the exact authorized test repair and truthful required status", () => {
  const result = verifyRepairException(input);
  expect(result).toMatchObject({
    path: `/repos/${repairScope.repository}/statuses/${repairScope.headSha}`,
    body: {
      state: "success",
      context: "crowdin-ai-delivery",
      description: "Authorized test-only repair exception; no translations changed",
    },
  });
  expect(result.body.target_url).toContain("/actions/runs/34293094835");
});

it.each([
  [
    "wrong PR",
    (x) => {
      x.pr.number = 26;
    },
  ],
  [
    "closed PR",
    (x) => {
      x.pr.state = "closed";
    },
  ],
  [
    "draft PR",
    (x) => {
      x.pr.draft = true;
    },
  ],
  [
    "fork",
    (x) => {
      x.pr.head.repo.full_name = "other/repo";
    },
  ],
  [
    "base branch",
    (x) => {
      x.pr.base.ref = "main";
    },
  ],
  [
    "head branch",
    (x) => {
      x.pr.head.ref = "aidan/crowdin-ai-candidate-20260909";
    },
  ],
  [
    "base SHA",
    (x) => {
      x.pr.base.sha = "a".repeat(40);
    },
  ],
  [
    "head SHA",
    (x) => {
      x.pr.head.sha = "a".repeat(40);
    },
  ],
  [
    "event repository",
    (x) => {
      x.event.repository.full_name = "other/repo";
    },
  ],
  [
    "task ref",
    (x) => {
      x.event.ref = "refs/heads/main";
    },
  ],
  [
    "deleted push",
    (x) => {
      x.event.deleted = true;
    },
  ],
  [
    "forced push",
    (x) => {
      x.event.forced = true;
    },
  ],
  [
    "wrong checkout",
    (x) => {
      x.trustedHead = "b".repeat(40);
    },
  ],
  [
    "wrong event head",
    (x) => {
      x.event.head_commit.id = "b".repeat(40);
    },
  ],
  [
    "base tree",
    (x) => {
      x.baseTree.sha = "a".repeat(40);
    },
  ],
  [
    "head tree",
    (x) => {
      x.headTree.sha = "a".repeat(40);
    },
  ],
  [
    "truncated tree",
    (x) => {
      x.headTree.truncated = true;
    },
  ],
  [
    "duplicate tree entry",
    (x) => {
      x.headTree.tree.push(x.headTree.tree[0]);
    },
  ],
  [
    "unrelated edit",
    (x) => {
      x.headTree.tree[0].sha = "a".repeat(40);
    },
  ],
  [
    "unrelated deletion",
    (x) => {
      x.headTree.tree.shift();
    },
  ],
  [
    "unrelated addition",
    (x) => {
      x.headTree.tree.push({
        path: "extra.txt",
        mode: "100644",
        type: "blob",
        sha: "a".repeat(40),
      });
    },
  ],
  [
    "test mode",
    (x) => {
      x.headTree.tree.find((e) => e.path === "scripts/ssr-workflow.test.mjs").mode = "100755";
    },
  ],
  [
    "blob SHA",
    (x) => {
      x.blob.sha = "a".repeat(40);
    },
  ],
  [
    "blob size",
    (x) => {
      x.blob.size += 1;
    },
  ],
  [
    "blob content",
    (x) => {
      x.blob.content = Buffer.alloc(2268).toString("base64");
    },
  ],
  [
    "run ID",
    (x) => {
      x.run.id += 1;
    },
  ],
  [
    "run head",
    (x) => {
      x.run.head_sha = "a".repeat(40);
    },
  ],
  [
    "run conclusion",
    (x) => {
      x.run.conclusion = "failure";
    },
  ],
  [
    "run event",
    (x) => {
      x.run.event = "push";
    },
  ],
  [
    "run workflow",
    (x) => {
      x.run.path = ".github/workflows/other.yml";
    },
  ],
  [
    "job name",
    (x) => {
      x.job.name = "other";
    },
  ],
  [
    "job conclusion",
    (x) => {
      x.job.conclusion = "skipped";
    },
  ],
  [
    "job run",
    (x) => {
      x.job.run_id += 1;
    },
  ],
  [
    "check app",
    (x) => {
      x.check.app.id = 1;
    },
  ],
  [
    "check head",
    (x) => {
      x.check.head_sha = "a".repeat(40);
    },
  ],
  [
    "check suite",
    (x) => {
      x.check.check_suite.id += 1;
    },
  ],
  [
    "check conclusion",
    (x) => {
      x.check.conclusion = "neutral";
    },
  ],
])("refuses %s", (_label, mutate) => {
  const copy = structuredClone(input);
  mutate(copy);
  expect(() => verifyRepairException(copy)).toThrow();
});

it("runs trusted task code without candidate checkout, Crowdin credentials, or dependency install", () => {
  const flow = parse(
    readFileSync(
      new URL("../../.github/workflows/crowdin-ai-repair-exception.yml", import.meta.url),
      "utf8",
    ),
  );
  expect(flow.on).toEqual({ push: { branches: ["aidan/crowdin-ai-recording-02"] } });
  expect(flow.permissions).toEqual({
    contents: "read",
    "pull-requests": "read",
    actions: "read",
    checks: "read",
    statuses: "write",
  });
  const steps = flow.jobs["authorized-test-repair"].steps;
  expect(steps[0].with).toEqual({ ref: "${{ github.sha }}", "persist-credentials": false });
  expect(steps.filter((s) => s.run)).toHaveLength(1);
  expect(JSON.stringify(flow)).not.toMatch(/CROWDIN_|pnpm|pull_request|protection|--admin/);
});

function runtime(change = () => {}) {
  const data = structuredClone(input);
  change(data);
  let prReads = 0;
  const fetchImpl = vi.fn(async (url, options) => {
    if (options.method === "POST") return new Response("{}", { status: 201 });
    let value;
    if (url.endsWith("/pulls/27")) {
      prReads += 1;
      value = prReads > 1 ? (data.lastPr ?? data.pr) : data.pr;
    } else if (url.includes(`/trees/${repairScope.baseTree}?`)) value = data.baseTree;
    else if (url.includes(`/trees/${repairScope.headTree}?`)) value = data.headTree;
    else if (url.includes("/git/blobs/")) value = data.blob;
    else if (url.includes("/actions/runs/")) value = data.run;
    else if (url.includes("/actions/jobs/")) value = data.job;
    else if (url.includes("/check-runs/")) value = data.check;
    else throw new Error("Unexpected read");
    return new Response(JSON.stringify(value), { status: 200 });
  });
  return {
    env: {
      GITHUB_EVENT_NAME: "push",
      GITHUB_REPOSITORY: repairScope.repository,
      GITHUB_REF: repairScope.taskRef,
      GITHUB_SHA: taskSha,
      GH_TOKEN: "mock-token",
      GITHUB_EVENT_PATH: "event.json",
      GITHUB_STEP_SUMMARY: "summary.md",
    },
    read: async () => JSON.stringify(data.event),
    gitHead: () => taskSha,
    summary: vi.fn(),
    fetchImpl,
  };
}

it("publishes only after all validation and a second exact PR read", async () => {
  const test = runtime();
  await runRepairException(test);
  const calls = test.fetchImpl.mock.calls;
  expect(calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  expect(calls.filter(([url]) => url.endsWith("/pulls/27"))).toHaveLength(2);
  expect(calls.at(-1)[0]).toBe(
    `https://api.github.com/repos/${repairScope.repository}/statuses/${repairScope.headSha}`,
  );
  expect(JSON.parse(calls.at(-1)[1].body).description).toBe(
    "Authorized test-only repair exception; no translations changed",
  );
});

it.each([
  [
    "stale PR at publication",
    (data) => {
      data.lastPr = structuredClone(data.pr);
      data.lastPr.head.sha = "a".repeat(40);
    },
  ],
  [
    "closed PR at publication",
    (data) => {
      data.lastPr = structuredClone(data.pr);
      data.lastPr.state = "closed";
    },
  ],
  [
    "extra changed file",
    (data) => {
      data.headTree.tree[0].sha = "a".repeat(40);
    },
  ],
  [
    "failed verify",
    (data) => {
      data.check.conclusion = "failure";
    },
  ],
])("makes no status write for %s", async (_label, change) => {
  const test = runtime(change);
  await expect(runRepairException(test)).rejects.toThrow();
  expect(test.fetchImpl.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
  expect(test.summary).not.toHaveBeenCalled();
});
