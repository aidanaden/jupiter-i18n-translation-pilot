import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatter } from "@lingui/format-po";
import { afterEach, expect, it } from "vitest";
import { parse } from "yaml";

import { runReviewTest } from "./github-review-test.mjs";

const repository = "aidanaden/jupiter-i18n-translation-pilot";
const branch = "aidan/provider-e2e-lingo-01";
const sha = "a".repeat(40);
const cleanups = [];
afterEach(async () =>
  Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true }))),
);

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "jupiter-review-test-"));
  cleanups.push(root);
  const fixtures = "scripts/provider-e2e/";
  const names = [
    "live-lingo/locales/en.po",
    "live-lingo-json/locales/zh-Hans.json",
    "live-lingo-json/derived/zh-Hans.po",
    "live-lingo-json/.lingo/config.json",
  ];
  for (const name of names) {
    await mkdir(join(root, fixtures, name, ".."), { recursive: true });
    await writeFile(join(root, fixtures, name), await readFile(new URL(name, import.meta.url)));
  }
  await mkdir(join(root, fixtures, "live-lingo-json/review-candidate"), { recursive: true });
  await writeFile(
    join(root, fixtures, "live-lingo-json/review-candidate/zh-Hans.po"),
    await readFile(new URL("live-lingo-json/derived/zh-Hans.po", import.meta.url)),
  );
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: `refs/heads/${branch}`,
    GITHUB_SHA: sha,
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "push",
    GITHUB_OUTPUT: join(root, "output"),
    GITHUB_STEP_SUMMARY: join(root, "summary"),
  };
  const remote = {
    run: {
      id: 123,
      run_attempt: 1,
      head_sha: sha,
      head_branch: branch,
      event: "push",
      repository: { full_name: repository },
      path: ".github/workflows/provider-e2e-lingo-review.yml",
    },
    ref: { object: { sha } },
    environment: {
      id: 21361554249,
      name: "provider-e2e-lingo-review",
      can_admins_bypass: false,
      protection_rules: [
        {
          type: "required_reviewers",
          prevent_self_review: false,
          reviewers: [{ type: "User", reviewer: { id: 26812563 } }],
        },
      ],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    },
    policies: { total_count: 1, branch_policies: [{ id: 59274364, name: branch, type: "branch" }] },
    artifact: {
      id: 456,
      name: "lingo-review-123-1",
      expired: false,
      workflow_run: { id: 123, head_sha: sha, head_branch: branch },
    },
  };
  const paths = [];
  const readGitHub = async (path) => {
    paths.push(path);
    if (path.endsWith("/actions/runs/123")) return remote.run;
    if (path.includes("/git/ref/heads/")) return remote.ref;
    if (path.includes("/deployment-branch-policies")) return remote.policies;
    if (path.includes("/environments/")) return remote.environment;
    if (path.endsWith("/actions/artifacts/456")) return remote.artifact;
    throw new Error(`Unexpected API path ${path}`);
  };
  const options = { root, env, readGitHub };
  return { root, env, remote, paths, options };
}

it("prepares the real saved draft and verifies it without release authority", async () => {
  const { root, env, options } = await setup();
  const prepared = await runReviewTest("prepare", options);
  expect(prepared.deliveryAllowed).toBe(false);
  expect(await readFile(join(root, "summary"), "utf8")).toContain("滑点容忍度");
  expect(await readFile(join(root, "summary"), "utf8")).toContain("Slippage tolerance");
  const packet = JSON.parse(await readFile(join(root, "review-packet/packet.json"), "utf8"));
  expect(packet.targetPo).toBe(packet.rawTargetPo);
  expect(JSON.parse(packet.glossaryText)).toEqual({ terms: [], status: "not-configured" });
  env.EXPECTED_REVIEW_DIGEST = prepared.digest;
  env.REVIEW_ARTIFACT_ID = "456";
  expect(await runReviewTest("verify", options)).toEqual({
    digest: prepared.digest,
    status: "integrity-verified",
    deliveryAllowed: false,
  });
});

it.each([
  ["GITHUB_REPOSITORY", "attacker/repo"],
  ["GITHUB_REF", "refs/heads/main"],
  ["GITHUB_SHA", "$(echo x)"],
  ["GITHUB_RUN_ATTEMPT", "2"],
  ["GITHUB_RUN_ID", "123\nfoo=bad"],
  ["GITHUB_EVENT_NAME", "pull_request"],
])("rejects unsafe event metadata %s", async (key, value) => {
  const { env, options, paths } = await setup();
  env[key] = value;
  await expect(runReviewTest("prepare", options)).rejects.toThrow();
  expect(paths).toEqual([]);
});

it.each([
  [
    "run",
    (r) => {
      r.run_attempt = 2;
    },
  ],
  [
    "run",
    (r) => {
      r.head_sha = "b".repeat(40);
    },
  ],
  [
    "run",
    (r) => {
      r.repository.full_name = "other/repo";
    },
  ],
  [
    "ref",
    (r) => {
      r.object.sha = "b".repeat(40);
    },
  ],
  [
    "environment",
    (r) => {
      r.id = 1;
    },
  ],
  [
    "environment",
    (r) => {
      r.can_admins_bypass = true;
    },
  ],
  [
    "environment",
    (r) => {
      r.protection_rules = [];
    },
  ],
  [
    "environment",
    (r) => {
      r.protection_rules[0].reviewers[0].reviewer.id = 1;
    },
  ],
  [
    "environment",
    (r) => {
      r.protection_rules[0].reviewers.push({ type: "User", reviewer: { id: 2 } });
    },
  ],
  [
    "environment",
    (r) => {
      r.protection_rules[0].prevent_self_review = true;
    },
  ],
  [
    "policies",
    (r) => {
      r.total_count = 2;
    },
  ],
  [
    "policies",
    (r) => {
      r.branch_policies[0].name = "*";
    },
  ],
])("rejects changed remote %s before preparation", async (key, mutate) => {
  const { remote, options } = await setup();
  mutate(remote[key]);
  await expect(runReviewTest("prepare", options)).rejects.toThrow();
});

it.each(["digest", "packet", "artifact-run", "artifact-expired", "branch-moved", "rerun"])(
  "rejects %s after the review boundary",
  async (failure) => {
    const { root, env, remote, options } = await setup();
    const prepared = await runReviewTest("prepare", options);
    env.EXPECTED_REVIEW_DIGEST = prepared.digest;
    env.REVIEW_ARTIFACT_ID = "456";
    if (failure === "digest") env.EXPECTED_REVIEW_DIGEST = "0".repeat(64);
    if (failure === "packet") await writeFile(join(root, "review-packet/packet.json"), "{}");
    if (failure === "artifact-run") remote.artifact.workflow_run.id = 124;
    if (failure === "artifact-expired") remote.artifact.expired = true;
    if (failure === "branch-moved") remote.ref.object.sha = "b".repeat(40);
    if (failure === "rerun") env.GITHUB_RUN_ATTEMPT = "2";
    await expect(runReviewTest("verify", options)).rejects.toThrow();
  },
);

it("rejects changed original AI data and missing candidate files", async () => {
  const { root, options } = await setup();
  await writeFile(join(root, "scripts/provider-e2e/live-lingo-json/locales/zh-Hans.json"), "{}");
  await expect(runReviewTest("prepare", options)).rejects.toThrow();
});

it("requires the candidate file and does not fall back to the AI draft", async () => {
  const { root, options } = await setup();
  await rm(join(root, "scripts/provider-e2e/live-lingo-json/review-candidate/zh-Hans.po"));
  await expect(runReviewTest("prepare", options)).rejects.toThrow();
});

it("binds a correction without changing the original AI draft", async () => {
  const { root, env, options } = await setup();
  const targetPath = join(root, "scripts/provider-e2e/live-lingo-json/review-candidate/zh-Hans.po");
  const po = formatter({ explicitIdAsDefault: true });
  const catalog = po.parse(await readFile(targetPath, "utf8"));
  catalog["swap.submit"].translation = "确认兑换";
  await writeFile(targetPath, po.serialize(catalog, { locale: "zh-Hans", sourceLocale: "en" }));
  const result = await runReviewTest("prepare", options);
  const packet = JSON.parse(await readFile(join(root, "review-packet/packet.json"), "utf8"));
  expect(packet.targetPo).not.toBe(packet.rawTargetPo);
  env.EXPECTED_REVIEW_DIGEST = result.digest;
  env.REVIEW_ARTIFACT_ID = "456";
  expect((await runReviewTest("verify", options)).deliveryAllowed).toBe(false);
});

it.each(["engine", "source", "derived", "bad-candidate"])(
  "rejects invalid fixed %s input",
  async (name) => {
    const { root, options } = await setup();
    const paths = {
      engine: "live-lingo-json/.lingo/config.json",
      source: "live-lingo/locales/en.po",
      derived: "live-lingo-json/derived/zh-Hans.po",
      "bad-candidate": "live-lingo-json/review-candidate/zh-Hans.po",
    };
    await writeFile(join(root, "scripts/provider-e2e", paths[name]), "{}");
    await expect(runReviewTest("prepare", options)).rejects.toThrow();
  },
);

it.each(["id", "name", "head"])("rejects wrong artifact %s", async (key) => {
  const { env, remote, options } = await setup();
  const result = await runReviewTest("prepare", options);
  env.EXPECTED_REVIEW_DIGEST = result.digest;
  env.REVIEW_ARTIFACT_ID = "456";
  if (key === "id") remote.artifact.id = 457;
  if (key === "name") remote.artifact.name = "other-artifact";
  if (key === "head") remote.artifact.workflow_run.head_sha = "b".repeat(40);
  await expect(runReviewTest("verify", options)).rejects.toThrow();
});

it("rejects a well-formed changed packet against the prepare output", async () => {
  const { root, env, options } = await setup();
  const result = await runReviewTest("prepare", options);
  env.EXPECTED_REVIEW_DIGEST = result.digest;
  env.REVIEW_ARTIFACT_ID = "456";
  const path = join(root, "review-packet/packet.json");
  const packet = JSON.parse(await readFile(path, "utf8"));
  packet.engineConfigText += "\n";
  await writeFile(path, JSON.stringify(packet));
  await expect(runReviewTest("verify", options)).rejects.toThrow();
});

it("fails closed on a read API error", async () => {
  const { options } = await setup();
  await expect(
    runReviewTest("prepare", {
      ...options,
      readGitHub: async () => {
        throw new Error("403");
      },
    }),
  ).rejects.toThrow("403");
});

it("renders tags as text and displays the source context", async () => {
  const { root, options } = await setup();
  await runReviewTest("prepare", options);
  const text = await readFile(join(root, "summary"), "utf8");
  expect(text).toContain("&lt;link&gt;");
  expect(text).not.toContain("<link>");
  expect(text).toContain("Swap button. Fixed-data demonstration only.");
});

it("wires the native environment to the exact immutable artifact and digest", async () => {
  const text = await readFile(
    new URL("../../.github/workflows/provider-e2e-lingo-review.yml", import.meta.url),
    "utf8",
  );
  const workflow = parse(text);
  expect(workflow.on).toEqual({ push: { branches: [branch] } });
  expect(workflow.permissions).toEqual({ contents: "read", actions: "read" });
  const { prepare, review } = workflow.jobs;
  expect(prepare.if).not.toContain("run_attempt");
  expect(prepare.environment).toBeUndefined();
  expect(review.environment).toBe("provider-e2e-lingo-review");
  expect(review.needs).toBe("prepare");
  expect(
    review.steps.find((s) => s.uses?.startsWith("actions/download-artifact@")).with["artifact-ids"],
  ).toBe("${{ needs.prepare.outputs.artifact-id }}");
  expect(review.steps.find((s) => s.run?.endsWith(" verify")).env.EXPECTED_REVIEW_DIGEST).toBe(
    "${{ needs.prepare.outputs.digest }}",
  );
  expect(text).not.toMatch(
    /secrets\.(?!GITHUB_TOKEN)|deployments:\s*write|contents:\s*write|--force|wrangler|git push/,
  );
});
