import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { expect, it, vi } from "vitest";
import { parse } from "yaml";

import {
  repairScope,
  runRepairException,
  verifyRepairException,
} from "./crowdin-ai-code-repair-exception.mjs";

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
  number: 28,
  state: "open",
  draft: false,
  head: {
    ref: "aidan/crowdin-ai-stable-catalog-repair",
    sha: "5fc3a4a12606bb70c191629f81a9fb62f03d0301",
    repo: { full_name: repairScope.repository },
  },
  base: {
    ref: "aidan/provider-e2e-crowdin-ai-base",
    sha: "2e476be7ab29563470a358d8a1ddbffe05034f17",
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
  baseTree: tree(repairScope.baseSha, "c52b31b71d29ceeace3f800970e1e57094cc1469"),
  headTree: tree(repairScope.headSha, "875992240ae9223f0dace4abc2f38e9768ea8652"),
  blobs: repairScope.files.map((file) => ({
    sha: file.blob,
    size: file.size,
    encoding: "base64",
    content: Buffer.from(git("show", `${repairScope.headSha}:${file.path}`)).toString("base64"),
  })),
  run: {
    id: 34295023204,
    head_sha: repairScope.headSha,
    event: "pull_request",
    head_branch: "aidan/crowdin-ai-stable-catalog-repair",
    status: "completed",
    conclusion: "success",
    path: ".github/workflows/ci.yml",
    check_suite_id: 92904564794,
  },
  job: {
    id: 102289661740,
    run_id: 34295023204,
    head_sha: repairScope.headSha,
    name: "verify",
    status: "completed",
    conclusion: "success",
    check_run_url: `https://api.github.com/repos/${repairScope.repository}/check-runs/102289661740`,
  },
  check: {
    id: 102289661740,
    head_sha: repairScope.headSha,
    name: "verify",
    status: "completed",
    conclusion: "success",
    app: { id: 15368 },
    check_suite: { id: 92904564794 },
  },
};

it("allows only the exact authorized three-file PR28 repair", () => {
  expect(verifyRepairException(input)).toMatchObject({
    path: `/repos/${repairScope.repository}/statuses/${repairScope.headSha}`,
    body: {
      state: "success",
      context: "crowdin-ai-delivery",
      description: "Authorized code-repair exception; no translations changed",
    },
  });
  expect(Object.isFrozen(repairScope.files[0])).toBe(true);
});

it.each([
  [
    "PR26",
    (x) => {
      x.pr.number = 26;
    },
  ],
  [
    "PR27",
    (x) => {
      x.pr.number = 27;
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
      x.pr.head.ref = "aidan/crowdin-ai-base-test-repair";
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
    "missing approved file",
    (x) => {
      x.headTree.tree = x.headTree.tree.filter((e) => e.path !== repairScope.files[0].path);
    },
  ],
  [
    "wrong mode",
    (x) => {
      x.headTree.tree.find((e) => e.path === repairScope.files[0].path).mode = "100755";
    },
  ],
  [
    "missing blob",
    (x) => {
      x.blobs.pop();
    },
  ],
  [
    "duplicate blob",
    (x) => {
      x.blobs[1] = x.blobs[0];
    },
  ],
  [
    "blob SHA",
    (x) => {
      x.blobs[0].sha = "a".repeat(40);
    },
  ],
  [
    "blob size",
    (x) => {
      x.blobs[0].size += 1;
    },
  ],
  [
    "blob content",
    (x) => {
      x.blobs[0].content = Buffer.alloc(x.blobs[0].size).toString("base64");
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

it("keeps the completed one-time trigger absent and audits its trusted execution scope", () => {
  expect(
    existsSync(
      new URL("../../.github/workflows/crowdin-ai-code-repair-exception.yml", import.meta.url),
    ),
  ).toBe(false);
  const flow = parse(
    git(
      "show",
      "696213d23dc041ddbf6a75bfb2e378114ea2502c:.github/workflows/crowdin-ai-code-repair-exception.yml",
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
  expect(flow.jobs["authorized-code-repair"].steps[0].with).toEqual({
    ref: "${{ github.sha }}",
    "persist-credentials": false,
  });
  expect(flow.jobs["authorized-code-repair"].if).toBe(
    "github.repository == 'aidanaden/jupiter-i18n-translation-pilot' && github.ref == 'refs/heads/aidan/crowdin-ai-recording-02'",
  );
  expect(flow.jobs["authorized-code-repair"]["timeout-minutes"]).toBe(5);
  expect(flow.jobs["authorized-code-repair"].steps).toEqual([
    {
      uses: "actions/checkout@v4",
      with: { ref: "${{ github.sha }}", "persist-credentials": false },
    },
    { uses: "actions/setup-node@v4", with: { "node-version": 22 } },
    {
      run: "node scripts/provider-e2e/crowdin-ai-code-repair-exception.mjs",
      env: { GH_TOKEN: "${{ github.token }}" },
    },
  ]);
  expect(JSON.stringify(flow)).not.toMatch(/CROWDIN_|pnpm|pull_request|protection|--admin/);
});

function runtime(change = () => {}) {
  const data = structuredClone(input);
  change(data);
  let prReads = 0;
  const fetchImpl = vi.fn(async (url, options) => {
    if (options.method === "POST") return new Response("{}", { status: 201 });
    let value;
    if (url.endsWith("/pulls/28")) {
      prReads += 1;
      value = prReads > 1 ? (data.lastPr ?? data.pr) : data.pr;
    } else if (url.includes(`/trees/${repairScope.baseTree}?`)) value = data.baseTree;
    else if (url.includes(`/trees/${repairScope.headTree}?`)) value = data.headTree;
    else if (url.includes("/git/blobs/")) value = data.blobs.find((blob) => url.endsWith(blob.sha));
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

it("posts once after the second exact PR read", async () => {
  const test = runtime();
  await runRepairException(test);
  const calls = test.fetchImpl.mock.calls;
  expect(calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  expect(calls.filter(([url]) => url.endsWith("/pulls/28"))).toHaveLength(2);
  expect(calls.at(-2)[0]).toBe(`https://api.github.com/repos/${repairScope.repository}/pulls/28`);
  expect(calls.at(-1)[0]).toBe(
    `https://api.github.com/repos/${repairScope.repository}/statuses/${repairScope.headSha}`,
  );
  expect(JSON.parse(calls.at(-1)[1].body).description).toBe(
    "Authorized code-repair exception; no translations changed",
  );
});

it.each([
  [
    "stale PR",
    (x) => {
      x.lastPr = structuredClone(x.pr);
      x.lastPr.head.sha = "a".repeat(40);
    },
  ],
  [
    "closed PR",
    (x) => {
      x.lastPr = structuredClone(x.pr);
      x.lastPr.state = "closed";
    },
  ],
  [
    "extra changed file",
    (x) => {
      x.headTree.tree[0].sha = "a".repeat(40);
    },
  ],
  [
    "failed CI",
    (x) => {
      x.check.conclusion = "failure";
    },
  ],
  [
    "PR26",
    (x) => {
      x.pr.number = 26;
    },
  ],
  [
    "PR27",
    (x) => {
      x.pr.number = 27;
    },
  ],
])("does not write a status for %s", async (_label, change) => {
  const test = runtime(change);
  await expect(runRepairException(test)).rejects.toThrow();
  expect(test.fetchImpl.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
  expect(test.summary).not.toHaveBeenCalled();
});
