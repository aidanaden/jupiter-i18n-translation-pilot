import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";
import { parse } from "yaml";

import { prepareFullAppReview, verifyFullAppReview } from "./full-app-review.mjs";
import { runFullAppReview } from "./full-app-review-cli.mjs";
import { lingoJsonToPo, poToLingoJson } from "./lingo-json.mjs";
import { verifyMaintainerReview, verifyMaintainerPreflight } from "./maintainer-check.mjs";

const repository = "aidanaden/jupiter-i18n-translation-pilot";
const baseBranch = "aidan/provider-e2e-lingo-base";
const headBranch = "aidan/lingo-candidate-test-01";
const target = "src/i18n/locales/zh-Hans/messages.po";
const source = "src/i18n/locales/en/messages.po";
const baseSha = "a".repeat(40);
const firstSha = "b".repeat(40);
const headSha = "c".repeat(40);
const mergeSha = "d".repeat(40);
const prefix = `/repos/${repository}`;

async function fixture() {
  const sourcePo = await readFile(new URL(`../../${source}`, import.meta.url), "utf8");
  const baselineTargetPo = await readFile(new URL(`../../${target}`, import.meta.url), "utf8");
  const messages = poToLingoJson(sourcePo, { expectedMessageCount: 13 });
  const rawTargetPo = lingoJsonToPo(
    sourcePo,
    { ...messages, "pilot.recording.proof": "测试初稿" },
    { expectedMessageCount: 13 },
  );
  const candidatePo = lingoJsonToPo(
    sourcePo,
    { ...messages, "pilot.recording.proof": "测试修订" },
    { expectedMessageCount: 13 },
  );
  const event = {
    repository,
    number: 21,
    baseBranch,
    headBranch,
    baseSha,
    headSha,
    mergeSha,
    runId: 123,
    runAttempt: 1,
    ref: "refs/pull/21/merge",
    eventName: "pull_request",
  };
  const file = { filename: target, status: "modified" };
  const data = {
    [`${prefix}/pulls/21`]: {
      number: 21,
      state: "open",
      draft: false,
      base: { ref: baseBranch, sha: baseSha, repo: { full_name: repository } },
      head: { ref: headBranch, sha: headSha, repo: { full_name: repository } },
      merge_commit_sha: mergeSha,
      changed_files: 1,
      commits: 2,
    },
    [`${prefix}/git/ref/heads/${encodeURIComponent(baseBranch)}`]: { object: { sha: baseSha } },
    [`${prefix}/git/ref/heads/${encodeURIComponent(headBranch)}`]: { object: { sha: headSha } },
    [`${prefix}/pulls/21/files?per_page=100`]: [file],
    [`${prefix}/pulls/21/commits?per_page=100`]: [{ sha: firstSha }, { sha: headSha }],
    [`${prefix}/commits/${firstSha}?per_page=100`]: {
      sha: firstSha,
      parents: [{ sha: baseSha }],
      files: [file],
    },
    [`${prefix}/commits/${headSha}?per_page=100`]: {
      sha: headSha,
      parents: [{ sha: firstSha }],
      files: [file],
    },
    [`${prefix}/actions/runs/123`]: {
      id: 123,
      run_attempt: 1,
      head_sha: headSha,
      head_branch: headBranch,
      event: "pull_request",
      repository: { full_name: repository },
      path: ".github/workflows/provider-e2e-lingo-full-review.yml",
      pull_requests: [{ number: 21, head: { sha: headSha }, base: { sha: baseSha } }],
    },
    [`${prefix}/environments/provider-e2e-lingo-full-review`]: {
      id: 21366555631,
      name: "provider-e2e-lingo-full-review",
      can_admins_bypass: false,
      protection_rules: [
        {
          type: "required_reviewers",
          prevent_self_review: false,
          reviewers: [{ type: "User", reviewer: { id: 26812563 } }],
        },
        { type: "branch_policy" },
      ],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    },
    [`${prefix}/environments/provider-e2e-lingo-full-review/deployment-branch-policies?per_page=100`]:
      {
        total_count: 1,
        branch_policies: [{ id: 59281812, name: "refs/pull/*/merge", type: "branch" }],
      },
    [`${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`]: {
      enforce_admins: { enabled: true },
      required_status_checks: {
        strict: true,
        contexts: ["lingo-delivery"],
        checks: [{ context: "lingo-delivery", app_id: 15368 }],
      },
      required_pull_request_reviews: {
        required_approving_review_count: 0,
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
        require_last_push_approval: false,
        bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
      },
      required_linear_history: { enabled: true },
      required_conversation_resolution: { enabled: true },
      lock_branch: { enabled: false },
      block_creations: { enabled: false },
      allow_fork_syncing: { enabled: false },
      restrictions: null,
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
    },
  };
  for (const [path, sha, content] of [
    [source, baseSha, sourcePo],
    [target, baseSha, baselineTargetPo],
    [target, firstSha, rawTargetPo],
    [target, headSha, candidatePo],
  ])
    data[`${prefix}/contents/${path}?ref=${sha}`] = {
      type: "file",
      encoding: "base64",
      size: Buffer.byteLength(content),
      content: Buffer.from(content).toString("base64"),
      path,
    };
  return {
    event,
    sourcePo,
    baselineTargetPo,
    rawTargetPo,
    candidatePo,
    data,
    readGitHub: async (path) => {
      if (!(path in data)) throw new Error(`Unexpected API path: ${path}`);
      return structuredClone(data[path]);
    },
  };
}

it("prepares the 13-message app and retains the first draft and corrected candidate", async () => {
  const input = await fixture();
  const result = await prepareFullAppReview(input);
  expect(result.packet.rawTargetPo).toBe(input.rawTargetPo);
  expect(result.packet.candidatePo).toBe(input.candidatePo);
  expect(result.packet.firstDraftSha).toBe(firstSha);
  expect(result.packet.deliveryAllowed).toBe(false);
  expect(result.markdown).toContain("测试初稿");
  expect(result.markdown).toContain("测试修订");
  expect(result.markdown).toContain("not qualified Chinese review");
});

async function ready() {
  const input = await fixture();
  const prepared = await prepareFullAppReview(input);
  input.data[`${prefix}/actions/artifacts/99`] = {
    id: 99,
    name: prepared.artifactName,
    expired: false,
    workflow_run: { id: 123, head_sha: headSha, head_branch: headBranch },
  };
  input.data[`${prefix}/actions/runs/123/approvals`] = [
    {
      state: "approved",
      user: { id: 26812563 },
      environments: [{ id: 21366555631, name: "provider-e2e-lingo-full-review" }],
    },
  ];
  return { ...input, ...prepared, expectedDigest: prepared.digest, artifactId: 99 };
}

it("verifies the same artifact only after the required account approved this run", async () => {
  const input = await ready();
  const receipt = await verifyFullAppReview(input);
  expect(receipt).toEqual({
    status: "reviewed-exact-head",
    digest: input.digest,
    repository,
    pullRequest: 21,
    runId: 123,
    runAttempt: 1,
    baseSha,
    headSha,
    firstDraftSha: firstSha,
    artifactId: 99,
    environmentId: 21366555631,
    reviewerId: 26812563,
    branchProtectionVerified: false,
    maintainerVerificationRequired: true,
    deliveryAllowed: false,
    mergeAllowed: false,
    deploymentAllowed: false,
  });
});

it.each([
  [
    "rerun",
    (x) => {
      x.event.runAttempt = 2;
    },
  ],
  [
    "wrong repository",
    (x) => {
      x.event.repository = "other/repo";
    },
  ],
  [
    "wrong base",
    (x) => {
      x.event.baseBranch = "main";
    },
  ],
  [
    "wrong merge ref",
    (x) => {
      x.event.ref = "refs/heads/main";
    },
  ],
  [
    "wrong merge SHA",
    (x) => {
      x.event.mergeSha = baseSha;
    },
  ],
  [
    "candidate code injection",
    (x) => {
      x.data[`${prefix}/pulls/21/files?per_page=100`].push({
        filename: "package.json",
        status: "modified",
      });
    },
  ],
  [
    "hidden old code change",
    (x) => {
      x.data[`${prefix}/commits/${firstSha}?per_page=100`].files.push({
        filename: "scripts/attack.mjs",
        status: "modified",
      });
    },
  ],
  [
    "renamed catalog",
    (x) => {
      x.data[`${prefix}/pulls/21/files?per_page=100`][0].previous_filename = "old.po";
    },
  ],
  [
    "added catalog",
    (x) => {
      x.data[`${prefix}/pulls/21/files?per_page=100`][0].status = "added";
    },
  ],
  [
    "closed PR",
    (x) => {
      x.data[`${prefix}/pulls/21`].state = "closed";
    },
  ],
  [
    "draft PR",
    (x) => {
      x.data[`${prefix}/pulls/21`].draft = true;
    },
  ],
  [
    "fork",
    (x) => {
      x.data[`${prefix}/pulls/21`].head.repo.full_name = "fork/repo";
    },
  ],
  [
    "changed head",
    (x) => {
      x.data[`${prefix}/pulls/21`].head.sha = firstSha;
    },
  ],
  [
    "changed base",
    (x) => {
      x.data[`${prefix}/git/ref/heads/${encodeURIComponent(baseBranch)}`].object.sha = firstSha;
    },
  ],
  [
    "changed head ref",
    (x) => {
      x.data[`${prefix}/git/ref/heads/${encodeURIComponent(headBranch)}`].object.sha = firstSha;
    },
  ],
  [
    "nonlinear history",
    (x) => {
      x.data[`${prefix}/commits/${headSha}?per_page=100`].parents.push({ sha: baseSha });
    },
  ],
  [
    "wrong first parent",
    (x) => {
      x.data[`${prefix}/commits/${firstSha}?per_page=100`].parents[0].sha = headSha;
    },
  ],
  [
    "truncated history",
    (x) => {
      x.data[`${prefix}/pulls/21/commits?per_page=100`].pop();
    },
  ],
  [
    "too many commits",
    (x) => {
      x.data[`${prefix}/pulls/21`].commits = 11;
    },
  ],
  [
    "local source changed",
    (x) => {
      x.sourcePo += "\n";
    },
  ],
  [
    "local baseline changed",
    (x) => {
      x.baselineTargetPo += "\n";
    },
  ],
  [
    "wrong encoding",
    (x) => {
      x.data[`${prefix}/contents/${target}?ref=${headSha}`].encoding = "none";
    },
  ],
  [
    "bad base64",
    (x) => {
      x.data[`${prefix}/contents/${target}?ref=${headSha}`].content += "!";
    },
  ],
  [
    "truncated file",
    (x) => {
      x.data[`${prefix}/contents/${target}?ref=${headSha}`].size += 1;
    },
  ],
  [
    "large file",
    (x) => {
      x.data[`${prefix}/contents/${target}?ref=${headSha}`].size = 100001;
    },
  ],
  [
    "missing reviewer",
    (x) => {
      x.data[`${prefix}/environments/provider-e2e-lingo-full-review`].protection_rules.shift();
    },
  ],
  [
    "extra reviewer",
    (x) => {
      x.data[
        `${prefix}/environments/provider-e2e-lingo-full-review`
      ].protection_rules[0].reviewers.push({ type: "User", reviewer: { id: 99 } });
    },
  ],
  [
    "admin bypass",
    (x) => {
      x.data[`${prefix}/environments/provider-e2e-lingo-full-review`].can_admins_bypass = true;
    },
  ],
  [
    "custom environment rule",
    (x) => {
      x.data[`${prefix}/environments/provider-e2e-lingo-full-review`].protection_rules.push({
        type: "custom",
      });
    },
  ],
  [
    "long wait",
    (x) => {
      x.data[`${prefix}/environments/provider-e2e-lingo-full-review`].protection_rules.push({
        type: "wait_timer",
        wait_timer: 60,
      });
    },
  ],
  [
    "wrong environment branch",
    (x) => {
      x.data[
        `${prefix}/environments/provider-e2e-lingo-full-review/deployment-branch-policies?per_page=100`
      ].branch_policies[0].name = baseBranch;
    },
  ],
  [
    "admin branch bypass",
    (x) => {
      x.data[
        `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`
      ].enforce_admins.enabled = false;
    },
  ],
  [
    "loose status checks",
    (x) => {
      x.data[
        `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`
      ].required_status_checks.strict = false;
    },
  ],
  [
    "wrong check app",
    (x) => {
      x.data[
        `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`
      ].required_status_checks.checks[0].app_id = 99;
    },
  ],
  [
    "missing PR protection",
    (x) => {
      x.data[
        `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`
      ].required_pull_request_reviews = null;
    },
  ],
  [
    "PR bypass",
    (x) => {
      x.data[
        `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`
      ].required_pull_request_reviews.bypass_pull_request_allowances.users = [{ id: 26812563 }];
    },
  ],
  [
    "force push enabled",
    (x) => {
      x.data[
        `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`
      ].allow_force_pushes.enabled = true;
    },
  ],
  [
    "deletion enabled",
    (x) => {
      x.data[
        `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`
      ].allow_deletions.enabled = true;
    },
  ],
  [
    "missing approval",
    (x) => {
      x.data[`${prefix}/actions/runs/123/approvals`] = [];
    },
  ],
  [
    "wrong approver",
    (x) => {
      x.data[`${prefix}/actions/runs/123/approvals`][0].user.id = 99;
    },
  ],
  [
    "rejected approval",
    (x) => {
      x.data[`${prefix}/actions/runs/123/approvals`][0].state = "rejected";
    },
  ],
  [
    "wrong approval environment",
    (x) => {
      x.data[`${prefix}/actions/runs/123/approvals`][0].environments[0].id = 78;
    },
  ],
  [
    "conflicting approval",
    (x) => {
      x.data[`${prefix}/actions/runs/123/approvals`].push({
        state: "rejected",
        user: { id: 26812563 },
        environments: [{ id: 21366555631, name: "provider-e2e-lingo-full-review" }],
      });
    },
  ],
  [
    "unknown packet field",
    (x) => {
      x.packet.approved = true;
    },
  ],
  [
    "changed digest",
    (x) => {
      x.expectedDigest = "0".repeat(64);
    },
  ],
  [
    "changed candidate packet",
    (x) => {
      x.packet.candidatePo += "\n";
    },
  ],
  [
    "wrong artifact name",
    (x) => {
      x.data[`${prefix}/actions/artifacts/99`].name += "-other";
    },
  ],
  [
    "expired artifact",
    (x) => {
      x.data[`${prefix}/actions/artifacts/99`].expired = true;
    },
  ],
  [
    "wrong artifact run",
    (x) => {
      x.data[`${prefix}/actions/artifacts/99`].workflow_run.id = 124;
    },
  ],
  [
    "wrong artifact head",
    (x) => {
      x.data[`${prefix}/actions/artifacts/99`].workflow_run.head_sha = firstSha;
    },
  ],
  [
    "wrong run",
    (x) => {
      x.data[`${prefix}/actions/runs/123`].head_sha = firstSha;
    },
  ],
])("rejects %s", async (_name, mutate) => {
  const input = await ready();
  mutate(input);
  const protectionCases = [
    "admin branch bypass",
    "loose status checks",
    "wrong check app",
    "missing PR protection",
    "PR bypass",
    "force push enabled",
    "deletion enabled",
  ];
  if (protectionCases.includes(_name)) {
    const maintainerInput = await maintainerReady();
    mutate(maintainerInput);
    await expect(verifyMaintainerPreflight(maintainerInput)).rejects.toThrow(
      "Unsafe isolated branch protection",
    );
  } else await expect(verifyFullAppReview(input)).rejects.toThrow();
});

async function maintainerReady() {
  const input = await ready();
  const trustedTree = [
    {
      path: ".github/workflows/provider-e2e-lingo-full-review.yml",
      mode: "100644",
      type: "blob",
      sha: "1".repeat(40),
    },
    {
      path: "scripts/provider-e2e/full-app-review.mjs",
      mode: "100644",
      type: "blob",
      sha: "2".repeat(40),
    },
    {
      path: "scripts/provider-e2e/full-app-review-cli.mjs",
      mode: "100644",
      type: "blob",
      sha: "3".repeat(40),
    },
    { path: "package.json", mode: "100644", type: "blob", sha: "4".repeat(40) },
    { path: "pnpm-lock.yaml", mode: "100644", type: "blob", sha: "5".repeat(40) },
    { path: target, mode: "100644", type: "blob", sha: "6".repeat(40) },
  ];
  for (const [sha, treeSha] of [
    [baseSha, "7".repeat(40)],
    [headSha, "8".repeat(40)],
    [mergeSha, "9".repeat(40)],
  ]) {
    input.data[`${prefix}/git/commits/${sha}`] = {
      sha,
      tree: { sha: treeSha },
      parents: sha === mergeSha ? [{ sha: baseSha }, { sha: headSha }] : [],
    };
    input.data[`${prefix}/git/trees/${treeSha}?recursive=1`] = {
      sha: treeSha,
      truncated: false,
      tree: structuredClone(trustedTree),
    };
  }
  input.data[`${prefix}/actions/runs/123`].status = "completed";
  input.data[`${prefix}/actions/runs/123`].conclusion = "success";
  input.data[`${prefix}/actions/runs/123/attempts/1/jobs?per_page=100`] = {
    total_count: 3,
    jobs: ["prepare", "reviewed", "lingo-delivery"].map((name, id) => ({
      id: id + 1,
      name,
      run_id: 123,
      run_attempt: 1,
      head_sha: headSha,
      status: "completed",
      conclusion: "success",
    })),
  };
  const archiveDigest = "f".repeat(64);
  input.data[`${prefix}/actions/artifacts/99`].digest = `sha256:${archiveDigest}`;
  return { ...input, trustedBaseSha: baseSha, trustedTree, archiveDigest };
}

it("prepares without the Administration permission and marks branch protection as unchecked", async () => {
  const input = await ready();
  delete input.data[`${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`];
  const result = await verifyFullAppReview(input);
  expect(result.maintainerVerificationRequired).toBe(true);
  expect(result.branchProtectionVerified).toBe(false);
  expect(result.mergeAllowed).toBe(false);
});

it("permits only readiness for user approval after local trust and live proof match", async () => {
  const receipt = await verifyMaintainerReview(await maintainerReady());
  expect(receipt.status).toBe("ready-for-user-approval");
  expect(receipt.mergeAllowed).toBe(false);
  expect(receipt.deploymentAllowed).toBe(false);
  expect(receipt.freshVerificationRequiredBeforeAction).toBe(true);
});

it("rejects a head that changes during final verification", async () => {
  const input = await maintainerReady();
  const read = input.readGitHub;
  let reads = 0;
  input.readGitHub = async (path) => {
    if (path === `${prefix}/pulls/21` && ++reads === 2) input.data[path].head.sha = firstSha;
    return read(path);
  };
  await expect(verifyMaintainerReview(input)).rejects.toThrow("differs from the event");
});

it.each([
  [
    "wrong trusted base",
    (x) => {
      x.trustedBaseSha = firstSha;
    },
  ],
  [
    "missing branch protection",
    (x) => {
      delete x.data[`${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`];
    },
  ],
  [
    "altered base executable",
    (x) => {
      x.data[`${prefix}/git/trees/${"7".repeat(40)}?recursive=1`].tree[1].sha = firstSha;
    },
  ],
  [
    "altered merge workflow",
    (x) => {
      x.data[`${prefix}/git/trees/${"9".repeat(40)}?recursive=1`].tree[0].sha = firstSha;
    },
  ],
  [
    "altered head workflow",
    (x) => {
      x.data[`${prefix}/git/trees/${"8".repeat(40)}?recursive=1`].tree[0].sha = firstSha;
    },
  ],
  [
    "truncated remote tree",
    (x) => {
      x.data[`${prefix}/git/trees/${"9".repeat(40)}?recursive=1`].truncated = true;
    },
  ],
  [
    "wrong merge parents",
    (x) => {
      x.data[`${prefix}/git/commits/${mergeSha}`].parents.reverse();
    },
  ],
  [
    "missing trusted workflow",
    (x) => {
      x.trustedTree.shift();
    },
  ],
  [
    "skipped review job",
    (x) => {
      x.data[`${prefix}/actions/runs/123/attempts/1/jobs?per_page=100`].jobs[1].conclusion =
        "skipped";
    },
  ],
  [
    "forged status only",
    (x) => {
      x.data[`${prefix}/actions/runs/123/attempts/1/jobs?per_page=100`].jobs = [];
    },
  ],
  [
    "duplicate job",
    (x) => {
      x.data[`${prefix}/actions/runs/123/attempts/1/jobs?per_page=100`].jobs[1].name = "prepare";
    },
  ],
  [
    "wrong job run",
    (x) => {
      x.data[`${prefix}/actions/runs/123/attempts/1/jobs?per_page=100`].jobs[0].run_id = 124;
    },
  ],
  [
    "wrong job head",
    (x) => {
      x.data[`${prefix}/actions/runs/123/attempts/1/jobs?per_page=100`].jobs[0].head_sha = firstSha;
    },
  ],
  [
    "incomplete jobs page",
    (x) => {
      x.data[`${prefix}/actions/runs/123/attempts/1/jobs?per_page=100`].total_count = 4;
    },
  ],
  [
    "running workflow",
    (x) => {
      x.data[`${prefix}/actions/runs/123`].status = "in_progress";
    },
  ],
  [
    "failed workflow",
    (x) => {
      x.data[`${prefix}/actions/runs/123`].conclusion = "failure";
    },
  ],
  [
    "wrong archive digest",
    (x) => {
      x.archiveDigest = "e".repeat(64);
    },
  ],
  [
    "missing artifact digest",
    (x) => {
      delete x.data[`${prefix}/actions/artifacts/99`].digest;
    },
  ],
])("maintainer check rejects %s", async (_name, mutate) => {
  const input = await maintainerReady();
  mutate(input);
  await expect(verifyMaintainerReview(input)).rejects.toThrow();
});

it("rejects malformed placeholders in a full 13-message candidate", async () => {
  const input = await fixture();
  const content = input.candidatePo.replaceAll("{jupiter}", "{broken}");
  input.data[`${prefix}/contents/${target}?ref=${headSha}`] = {
    type: "file",
    path: target,
    size: Buffer.byteLength(content),
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  };
  await expect(prepareFullAppReview(input)).rejects.toThrow("ICU arguments differ");
});

it("uses only trusted base code in both jobs and has no merge or deployment capability", async () => {
  const text = await readFile(
    new URL("../../.github/workflows/provider-e2e-lingo-full-review.yml", import.meta.url),
    "utf8",
  );
  const workflow = parse(text);
  expect(workflow.on).toEqual({
    pull_request: {
      branches: [baseBranch],
      types: ["opened", "synchronize", "reopened", "ready_for_review"],
    },
  });
  expect(workflow.permissions).toEqual({
    contents: "read",
    actions: "read",
    "pull-requests": "read",
  });
  expect(Object.keys(workflow.jobs)).toEqual(["prepare", "reviewed", "lingo-delivery"]);
  expect(workflow.jobs.reviewed.environment).toBe("provider-e2e-lingo-full-review");
  expect(workflow.jobs.reviewed.needs).toBe("prepare");
  for (const job of [workflow.jobs.prepare, workflow.jobs.reviewed]) {
    expect(job.steps.find((step) => step.uses?.startsWith("actions/checkout@"))?.with).toEqual({
      ref: "${{ github.event.pull_request.base.sha }}",
      "persist-credentials": false,
    });
    expect(
      job.steps.some((step) => step.run === "pnpm install --frozen-lockfile --ignore-scripts"),
    ).toBe(true);
    expect(
      job.steps
        .filter((step) => step.uses?.startsWith("actions/upload-artifact@"))
        .every((step) => step.with.overwrite === false),
    ).toBe(true);
  }
  expect(text).not.toMatch(/secrets\.|wrangler|gh pr merge|contents: write|pull_request_target/);
  const download = workflow.jobs.reviewed.steps.find((step) =>
    step.uses?.startsWith("actions/download-artifact@"),
  );
  expect(download.with["artifact-ids"]).toBe("${{ needs.prepare.outputs.artifact-id }}");
  const gate = workflow.jobs["lingo-delivery"];
  expect(gate.if).toBe("always()");
  expect(gate.needs).toEqual(["prepare", "reviewed"]);
  expect(gate.steps).toEqual([
    {
      run: 'test "$PREPARE_RESULT" = success && test "$REVIEW_RESULT" = success',
      env: {
        PREPARE_RESULT: "${{ needs.prepare.result }}",
        REVIEW_RESULT: "${{ needs.reviewed.result }}",
      },
    },
  ]);
});

it("writes a real preparation packet and a verified receipt through the CLI boundary", async () => {
  const input = await ready();
  const root = await mkdtemp(join(tmpdir(), "lingo-full-review-test-"));
  for (const [locale, text] of [
    ["en", input.sourcePo],
    ["zh-Hans", input.baselineTargetPo],
  ]) {
    await mkdir(join(root, `src/i18n/locales/${locale}`), { recursive: true });
    await writeFile(join(root, `src/i18n/locales/${locale}/messages.po`), text);
  }
  const eventPath = join(root, "event.json");
  await writeFile(
    eventPath,
    JSON.stringify({
      number: 21,
      repository: { full_name: repository },
      pull_request: input.data[`${prefix}/pulls/21`],
    }),
  );
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: mergeSha,
    GITHUB_REF: "refs/pull/21/merge",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_OUTPUT: join(root, "output"),
    GITHUB_STEP_SUMMARY: join(root, "summary"),
    EXPECTED_REVIEW_DIGEST: input.digest,
    REVIEW_ARTIFACT_ID: "99",
  };
  const prepared = await runFullAppReview("prepare", { root, env, readGitHub: input.readGitHub });
  expect(prepared.digest).toBe(input.digest);
  expect(JSON.parse(await readFile(join(root, "full-review-packet/packet.json"), "utf8"))).toEqual(
    input.packet,
  );
  await runFullAppReview("verify", { root, env, readGitHub: input.readGitHub });
  const receipt = JSON.parse(await readFile(join(root, "full-review-receipt.json"), "utf8"));
  expect(receipt.status).toBe("reviewed-exact-head");
  expect(receipt.deploymentAllowed).toBe(false);
  await expect(
    runFullAppReview("verify", { root, env, readGitHub: input.readGitHub }),
  ).rejects.toThrow();
});

it("fails the final required check for skipped, cancelled, or failed upstream jobs", async () => {
  const workflow = parse(
    await readFile(
      new URL("../../.github/workflows/provider-e2e-lingo-full-review.yml", import.meta.url),
      "utf8",
    ),
  );
  const command = workflow.jobs["lingo-delivery"].steps[0].run;
  for (const prepareResult of ["success", "skipped", "cancelled", "failure"]) {
    for (const reviewResult of ["success", "skipped", "cancelled", "failure"]) {
      const result = spawnSync("sh", ["-c", command], {
        env: { PREPARE_RESULT: prepareResult, REVIEW_RESULT: reviewResult },
      });
      expect(result.status === 0).toBe(prepareResult === "success" && reviewResult === "success");
    }
  }
});

it("does not accept changed remote candidate bytes after preparation", async () => {
  const input = await ready();
  const remote = input.data[`${prefix}/contents/${target}?ref=${headSha}`];
  const changed = `${input.candidatePo}\n`;
  remote.content = Buffer.from(changed).toString("base64");
  remote.size = Buffer.byteLength(changed);
  await expect(verifyFullAppReview(input)).rejects.toThrow("exact review packet changed");
});

it("escapes links and Markdown in review text", async () => {
  const input = await fixture();
  const messages = poToLingoJson(input.sourcePo, { expectedMessageCount: 13 });
  const content = lingoJsonToPo(
    input.sourcePo,
    { ...messages, "pilot.recording.proof": "[click](https://example.test) | `code` *text*" },
    { expectedMessageCount: 13 },
  );
  input.data[`${prefix}/contents/${target}?ref=${headSha}`] = {
    type: "file",
    path: target,
    encoding: "base64",
    size: Buffer.byteLength(content),
    content: Buffer.from(content).toString("base64"),
  };
  const result = await prepareFullAppReview(input);
  expect(result.markdown).toContain(
    "&#91;click&#93;(https://example.test) &#124; &#96;code&#96; &#42;text&#42;",
  );
  expect(result.markdown).not.toContain("[click]");
});
