import { expect, it } from "vitest";

import { readPrivatePullRequest, readPrivateCi } from "./crowdin-private-live.mjs";

const base = "e03b669d78b0e4704cb7640c2e1531867f47a835";
const head = "73b5446d667169407a704d1113ce18966dd80d5a";
const repository = "aidanaden/jupiter-i18n-translation-pilot";
function pr() {
  return {
    number: 38,
    state: "open",
    merged: false,
    draft: false,
    base: {
      sha: base,
      ref: "aidan/crowdin-private-recording-base-20260911",
      repo: { full_name: repository },
    },
    head: {
      sha: head,
      ref: "aidan/crowdin-private-recording-candidate-20260911",
      repo: { full_name: repository },
    },
    merge_commit_sha: "c".repeat(40),
  };
}
it("binds the exact open candidate and base", async () => {
  expect(await readPrivatePullRequest(async () => JSON.stringify(pr()))).toMatchObject({
    number: 38,
    head: { sha: head },
  });
});
it.each(["state", "base", "head", "repo", "number"])("rejects wrong PR %s", async (field) => {
  const value = pr();
  if (field === "state") value.state = "closed";
  if (field === "base") value.base.sha = "a".repeat(40);
  if (field === "head") value.head.sha = "a".repeat(40);
  if (field === "repo") value.head.repo.full_name = "attacker/repo";
  if (field === "number") value.number = 35;
  await expect(readPrivatePullRequest(async () => JSON.stringify(value))).rejects.toThrow();
});
function ci() {
  return {
    id: 34538979391,
    head_sha: head,
    event: "pull_request",
    path: ".github/workflows/ci.yml",
    head_branch: "aidan/crowdin-private-recording-candidate-20260911",
    check_suite_id: 93568362706,
    status: "completed",
    conclusion: "success",
    repository: { full_name: repository },
    pull_requests: [
      {
        number: 38,
        base: {
          sha: base,
          ref: "aidan/crowdin-private-recording-base-20260911",
          repo: { id: 1347944533 },
        },
        head: {
          sha: head,
          ref: "aidan/crowdin-private-recording-candidate-20260911",
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
        id: 103077036389,
        name: "verify",
        head_sha: head,
        app: { id: 15368, slug: "github-actions" },
        status: "completed",
        conclusion: "success",
        check_suite: { id: 93568362706 },
        details_url: `https://github.com/${repository}/actions/runs/34538979391/job/103077036389`,
      },
    ],
  };
}
it("requires successful GitHub Actions CI for this PR head and base", async () => {
  expect(
    await readPrivateCi(async (_, args) =>
      JSON.stringify(args.at(-1).includes("check-runs") ? checks() : ci()),
    ),
  ).toMatchObject({ runId: 34538979391 });
});
