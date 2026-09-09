import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, it, vi } from "vitest";
import { parse } from "yaml";

import { sourceScope, runSourceCheck, verifySourceCheck } from "./crowdin-ai-auto-source-check.mjs";

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
  number: 33,
  state: "open",
  draft: false,
  head: {
    ref: "aidan/crowdin-ai-visible-source-20260910",
    sha: "1abaf338ff8dd129c2abb4c14ff7a9bc26bcba05",
    repo: { full_name: sourceScope.repository },
  },
  base: {
    ref: "aidan/provider-e2e-crowdin-ai-base",
    sha: "dea6d47fba3d33d876ecb7dad763fe76385c102e",
    repo: { full_name: sourceScope.repository },
  },
};
const input = {
  event: {
    repository: { full_name: sourceScope.repository },
    ref: sourceScope.taskRef,
    after: taskSha,
    head_commit: { id: taskSha },
    forced: false,
    deleted: false,
  },
  trustedHead: taskSha,
  pr,
  baseTree: tree(sourceScope.baseSha, "9359fcb997f739f855f6f7b698d61af64e644ac6"),
  headTree: tree(sourceScope.headSha, "e6b6804ccb711d0cb85668b3d2b6574e4d244582"),
  blobs: sourceScope.files.map((file) => ({
    sha: file.blob,
    size: file.size,
    encoding: "base64",
    content: Buffer.from(git("show", `${sourceScope.headSha}:${file.path}`)).toString("base64"),
  })),
  run: {
    id: 34416174286,
    run_attempt: 1,
    head_sha: sourceScope.headSha,
    event: "pull_request",
    head_branch: "aidan/crowdin-ai-visible-source-20260910",
    status: "completed",
    conclusion: "success",
    path: ".github/workflows/ci.yml",
    check_suite_id: 93235775352,
  },
  job: {
    id: 102681433563,
    run_id: 34416174286,
    head_sha: sourceScope.headSha,
    name: "verify",
    status: "completed",
    conclusion: "success",
    check_run_url: `https://api.github.com/repos/${sourceScope.repository}/check-runs/102681433563`,
  },
  check: {
    id: 102681433563,
    head_sha: sourceScope.headSha,
    name: "verify",
    status: "completed",
    conclusion: "success",
    app: { id: 15368 },
    check_suite: { id: 93235775352 },
  },
};

it("allows only the exact approved five-file PR33 source update", () => {
  expect(verifySourceCheck(input)).toMatchObject({
    path: `/repos/${sourceScope.repository}/statuses/${sourceScope.headSha}`,
    body: {
      state: "success",
      context: "crowdin-ai-delivery",
      description: "Verified PR33 source update; not translation approval",
    },
  });
  expect(Object.isFrozen(sourceScope.files[0])).toBe(true);
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
      x.headTree.tree = x.headTree.tree.filter((e) => e.path !== sourceScope.files[0].path);
    },
  ],
  [
    "wrong mode",
    (x) => {
      x.headTree.tree.find((e) => e.path === sourceScope.files[0].path).mode = "100755";
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
  expect(() => verifySourceCheck(copy)).toThrow();
});

it("limits the source-check workflow to trusted task pushes", () => {
  const flow = parse(
    readFileSync(
      new URL("../../.github/workflows/crowdin-ai-auto-source-check.yml", import.meta.url),
      "utf8",
    ),
  );
  expect(flow.on).toEqual({
    push: { branches: ["aidan/crowdin-ai-visible-source-check-20260910"] },
  });
  expect(flow.permissions).toEqual({
    contents: "read",
    "pull-requests": "read",
    actions: "read",
    checks: "read",
    statuses: "write",
  });
  expect(flow.jobs["source-safety"].if).toBe(
    "github.repository == 'aidanaden/jupiter-i18n-translation-pilot' && github.ref == 'refs/heads/aidan/crowdin-ai-visible-source-check-20260910'",
  );
  expect(flow.jobs["source-safety"]["timeout-minutes"]).toBe(5);
  expect(flow.jobs["source-safety"].steps).toEqual([
    {
      uses: "actions/checkout@v4",
      with: { ref: "${{ github.sha }}", "persist-credentials": false },
    },
    { uses: "actions/setup-node@v4", with: { "node-version": 22 } },
    {
      run: "node scripts/provider-e2e/crowdin-ai-auto-source-check.mjs",
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
    if (url.endsWith("/pulls/33")) {
      prReads += 1;
      value = prReads > 1 ? (data.lastPr ?? data.pr) : data.pr;
    } else if (url.includes(`/trees/${sourceScope.baseTree}?`)) value = data.baseTree;
    else if (url.includes(`/trees/${sourceScope.headTree}?`)) value = data.headTree;
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
      GITHUB_REPOSITORY: sourceScope.repository,
      GITHUB_REF: sourceScope.taskRef,
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
  await runSourceCheck(test);
  const calls = test.fetchImpl.mock.calls;
  expect(calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  expect(calls.filter(([url]) => url.endsWith("/pulls/33"))).toHaveLength(2);
  expect(calls.at(-2)[0]).toBe(`https://api.github.com/repos/${sourceScope.repository}/pulls/33`);
  expect(calls.at(-1)[0]).toBe(
    `https://api.github.com/repos/${sourceScope.repository}/statuses/${sourceScope.headSha}`,
  );
  expect(JSON.parse(calls.at(-1)[1].body).description).toBe(
    "Verified PR33 source update; not translation approval",
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
  await expect(runSourceCheck(test)).rejects.toThrow();
  expect(test.fetchImpl.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
  expect(test.summary).not.toHaveBeenCalled();
});

it.each([
  [
    "different CI attempt",
    (x) => {
      x.run.run_attempt = 2;
    },
  ],
  [
    "Chinese PO edit",
    (x) => {
      x.headTree.tree.find((e) => e.path === "src/i18n/locales/zh-Hans/messages.po").sha =
        "b".repeat(40);
    },
  ],
  [
    "workflow edit",
    (x) => {
      x.headTree.tree.find((e) => e.path === ".github/workflows/ci.yml").sha = "b".repeat(40);
    },
  ],
  [
    "old repair PR",
    (x) => {
      x.pr.number = 28;
    },
  ],
  [
    "translation export PR",
    (x) => {
      x.pr.number = 30;
    },
  ],
])("does not publish source approval for %s", async (_label, change) => {
  const attempt = runtime(change);
  await expect(runSourceCheck(attempt)).rejects.toThrow();
  expect(attempt.fetchImpl.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
});
