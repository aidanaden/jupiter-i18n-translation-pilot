import * as z from "zod/v4-mini";

export const privateBaseSha = "be101fae90c42554de45deb5393b19771aa1318f";
const headSha = "93265e70610667a782e52a20d2de495e52e20ed3";
const repository = "aidanaden/jupiter-i18n-translation-pilot";
const baseBranch = "aidan/crowdin-private-source-20260911";
const headBranch = "aidan/crowdin-private-candidate-20260911";
const sha = z.string().check(z.regex(/^[a-f0-9]{40}$/u));
const repo = z.object({ full_name: z.literal(repository) });
const gitRef = (ref, commit) => z.object({ ref: z.literal(ref), sha: z.literal(commit), repo });

export async function readPrivatePullRequest(command) {
  return z.parse(
    z.object({
      number: z.literal(35),
      state: z.literal("open"),
      merged: z.literal(false),
      draft: z.literal(false),
      base: gitRef(baseBranch, privateBaseSha),
      head: gitRef(headBranch, headSha),
      merge_commit_sha: sha,
    }),
    JSON.parse(await command("gh", ["api", "--method", "GET", `repos/${repository}/pulls/35`])),
  );
}

export async function readPrivateCi(command) {
  const runId = 34522536375;
  const suiteId = 93523623013;
  const checkId = 103023298309;
  const success = { status: z.literal("completed"), conclusion: z.literal("success") };
  const runRef = (ref, commit) =>
    z.object({
      ref: z.literal(ref),
      sha: z.literal(commit),
      repo: z.object({ id: z.literal(1347944533) }),
    });
  z.parse(
    z.object({
      id: z.literal(runId),
      head_sha: z.literal(headSha),
      event: z.literal("pull_request"),
      path: z.literal(".github/workflows/ci.yml"),
      head_branch: z.literal(headBranch),
      check_suite_id: z.literal(suiteId),
      repository: repo,
      ...success,
      pull_requests: z.tuple([
        z.object({
          number: z.literal(35),
          base: runRef(baseBranch, privateBaseSha),
          head: runRef(headBranch, headSha),
        }),
      ]),
    }),
    JSON.parse(
      await command("gh", ["api", "--method", "GET", `repos/${repository}/actions/runs/${runId}`]),
    ),
  );
  z.parse(
    z.object({
      total_count: z.literal(1),
      check_runs: z.tuple([
        z.object({
          id: z.literal(checkId),
          name: z.literal("verify"),
          head_sha: z.literal(headSha),
          app: z.object({ id: z.literal(15368), slug: z.literal("github-actions") }),
          ...success,
          check_suite: z.object({ id: z.literal(suiteId) }),
          details_url: z.literal(
            `https://github.com/${repository}/actions/runs/${runId}/job/${checkId}`,
          ),
        }),
      ]),
    }),
    JSON.parse(
      await command("gh", [
        "api",
        "--method",
        "GET",
        `repos/${repository}/commits/${headSha}/check-runs?per_page=100`,
      ]),
    ),
  );
  return { runId, suiteId, checkId, headSha, baseSha: privateBaseSha };
}

export async function readPrivateTrees(command, pullRequest) {
  await command("git", [
    "fetch",
    "--no-tags",
    "--depth=100",
    `https://github.com/${repository}.git`,
    privateBaseSha,
    headSha,
  ]);
  const readTree = async (commit) => {
    const text = await command("git", ["ls-tree", "-rz", "--full-tree", commit]);
    if (!text.endsWith("\0")) throw new Error("Incomplete Git tree");
    return text
      .slice(0, -1)
      .split("\0")
      .map((line) => {
        const match = /^(100644|100755|120000|160000) (?:blob|commit) ([a-f0-9]{40})\t(.+)$/u.exec(
          line,
        );
        if (!match) throw new Error("Malformed Git tree");
        return { mode: match[1], oid: match[2], path: match[3] };
      });
  };
  if (pullRequest.base.sha !== privateBaseSha || pullRequest.head.sha !== headSha)
    throw new Error("Wrong Git heads");
  return {
    mergeBase: (await command("git", ["merge-base", privateBaseSha, headSha])).trim(),
    baseTree: await readTree(privateBaseSha),
    candidateTree: await readTree(headSha),
    candidatePo: await command("git", ["show", `${headSha}:src/i18n/locales/zh-Hans/messages.po`]),
  };
}
