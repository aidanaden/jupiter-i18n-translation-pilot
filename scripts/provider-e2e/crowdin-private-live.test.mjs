import { expect, it } from "vitest";

import { readPrivatePullRequest, readPrivateCi } from "./crowdin-private-live.mjs";

const base = "be101fae90c42554de45deb5393b19771aa1318f";
const head = "93265e70610667a782e52a20d2de495e52e20ed3";
const repository = "aidanaden/jupiter-i18n-translation-pilot";
function pr() {
  return {
    number: 35,
    state: "open",
    merged: false,
    draft: false,
    base: {
      sha: base,
      ref: "aidan/crowdin-private-source-20260911",
      repo: { full_name: repository },
    },
    head: {
      sha: head,
      ref: "aidan/crowdin-private-candidate-20260911",
      repo: { full_name: repository },
    },
    merge_commit_sha: "c".repeat(40),
  };
}
it("binds the exact open candidate and base", async () => {
  expect(await readPrivatePullRequest(async () => JSON.stringify(pr()))).toMatchObject({
    number: 35,
    head: { sha: head },
  });
});
it.each(["state", "base", "head", "repo", "number"])("rejects wrong PR %s", async (field) => {
  const value = pr();
  if (field === "state") value.state = "closed";
  if (field === "base") value.base.sha = "a".repeat(40);
  if (field === "head") value.head.sha = "a".repeat(40);
  if (field === "repo") value.head.repo.full_name = "attacker/repo";
  if (field === "number") value.number = 36;
  await expect(readPrivatePullRequest(async () => JSON.stringify(value))).rejects.toThrow();
});
function ci() {
  return {
    id: 34522536375,
    head_sha: head,
    event: "pull_request",
    path: ".github/workflows/ci.yml",
    head_branch: "aidan/crowdin-private-candidate-20260911",
    check_suite_id: 93523623013,
    status: "completed",
    conclusion: "success",
    repository: { full_name: repository },
    pull_requests: [
      {
        number: 35,
        base: { sha: base, ref: "aidan/crowdin-private-source-20260911", repo: { id: 1347944533 } },
        head: {
          sha: head,
          ref: "aidan/crowdin-private-candidate-20260911",
          repo: { id: 1347944533 },
        },
      },
    ],
  };
}
function checks() {
  return {
    total_count: 1,
    check_runs: [
      {
        id: 103023298309,
        name: "verify",
        head_sha: head,
        app: { id: 15368, slug: "github-actions" },
        status: "completed",
        conclusion: "success",
        check_suite: { id: 93523623013 },
        details_url: `https://github.com/${repository}/actions/runs/34522536375/job/103023298309`,
      },
    ],
  };
}
it("requires successful GitHub Actions CI for this PR head and base", async () => {
  expect(
    await readPrivateCi(async (_, args) =>
      JSON.stringify(args.at(-1).includes("check-runs") ? checks() : ci()),
    ),
  ).toMatchObject({ runId: 34522536375 });
});
