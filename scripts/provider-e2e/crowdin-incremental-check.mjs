import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runIncrementalCli } from "./crowdin-incremental-cli.mjs";
import { incrementalScope } from "./crowdin-incremental-delivery.mjs";

export const checkScope = Object.freeze({
  taskRef: "refs/heads/aidan/crowdin-incremental-delivery-20260910",
  workflow: ".github/workflows/crowdin-incremental-check.yml",
  number: 32,
  baseSha: "4a3b616c43a2f2bd32130cd56550d04affcb111f",
  headBranch: "aidan/crowdin-incremental-candidate-20260910",
  runId: 34411789697,
  jobId: 102667648715,
  suiteId: 93224405476,
});

function requireValue(value) {
  if (!value) throw new Error("Exact PR32 delivery check failed");
}

export async function runIncrementalCheck({
  env = process.env,
  runCommand = execFileSync,
  verifyCandidate = runIncrementalCli,
  now = () => Date.now(),
} = {}) {
  const repository = incrementalScope.repository;
  requireValue(
    env.GITHUB_EVENT_NAME === "push" &&
      env.GITHUB_REPOSITORY === repository &&
      env.GITHUB_REF === checkScope.taskRef &&
      env.GITHUB_WORKFLOW_REF === `${repository}/${checkScope.workflow}@${checkScope.taskRef}` &&
      /^[a-f0-9]{40}$/u.test(env.GITHUB_SHA) &&
      /^[0-9]+$/u.test(env.GITHUB_RUN_ID) &&
      env.GH_TOKEN &&
      env.RUNNER_TEMP,
  );
  const command = (name, args) =>
    runCommand(name, args, {
      encoding: "utf8",
      maxBuffer: 5000000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  requireValue(command("git", ["rev-parse", "HEAD"]).trim() === env.GITHUB_SHA);
  const api = (path) => JSON.parse(command("gh", ["api", `repos/${repository}${path}`]));
  function checkHeads() {
    const pr = api(`/pulls/${checkScope.number}`);
    requireValue(
      pr.number === checkScope.number &&
        pr.state === "open" &&
        pr.draft === false &&
        pr.base?.repo?.full_name === repository &&
        pr.head?.repo?.full_name === repository &&
        pr.base.ref === incrementalScope.baseBranch &&
        pr.head.ref === checkScope.headBranch &&
        pr.head.sha === incrementalScope.candidateSha,
    );
    requireValue(
      api(`/git/ref/heads/${incrementalScope.baseBranch}`).object?.sha === checkScope.baseSha,
    );
  }
  checkHeads();
  command("gh", [
    "api",
    `repos/${repository}/statuses/${incrementalScope.candidateSha}`,
    "--method",
    "POST",
    "-f",
    "state=pending",
    "-f",
    "context=crowdin-ai-delivery",
    "-f",
    "description=Checking exact PR32 candidate and current Crowdin approval",
  ]);
  const run = api(`/actions/runs/${checkScope.runId}`);
  const job = api(`/actions/jobs/${checkScope.jobId}`);
  const check = api(`/check-runs/${checkScope.jobId}`);
  requireValue(
    run.id === checkScope.runId &&
      run.run_attempt === 1 &&
      run.head_branch === checkScope.headBranch &&
      run.path === ".github/workflows/ci.yml" &&
      run.event === "pull_request" &&
      run.check_suite_id === checkScope.suiteId &&
      job.id === checkScope.jobId &&
      job.run_id === checkScope.runId &&
      job.name === "verify" &&
      job.check_run_url ===
        `https://api.github.com/repos/${repository}/check-runs/${checkScope.jobId}` &&
      check.id === checkScope.jobId &&
      check.name === "verify" &&
      check.app?.id === 15368 &&
      check.check_suite?.id === checkScope.suiteId,
  );
  for (const item of [run, job, check])
    requireValue(
      item.head_sha === incrementalScope.candidateSha &&
        item.status === "completed" &&
        item.conclusion === "success",
    );
  command("git", [
    "fetch",
    "--no-tags",
    `https://github.com/${repository}.git`,
    incrementalScope.candidateSha,
  ]);
  const receipt = await verifyCandidate([
    "verify",
    resolve(env.RUNNER_TEMP, "crowdin-incremental-verified"),
    incrementalScope.candidateSha,
  ]);
  const checkedAt = Date.parse(receipt.checkedAt);
  requireValue(
    receipt.status === "candidate-verified" &&
      receipt.repository === repository &&
      receipt.baseBranch === incrementalScope.baseBranch &&
      receipt.baseSha === checkScope.baseSha &&
      receipt.headSha === incrementalScope.candidateSha &&
      receipt.preservedMessages === 12 &&
      receipt.humanApprovalProved === false &&
      receipt.reviewerDisclosure === incrementalScope.reviewerDisclosure &&
      Number.isFinite(checkedAt),
  );
  checkHeads();
  requireValue(now() >= checkedAt && now() - checkedAt <= 60000);
  command("gh", [
    "api",
    `repos/${repository}/statuses/${incrementalScope.candidateSha}`,
    "--method",
    "POST",
    "-f",
    "state=success",
    "-f",
    "context=crowdin-ai-delivery",
    "-f",
    "description=PR32: one test-reviewed message; 12 accepted entries preserved",
    "-f",
    `target_url=https://github.com/${repository}/actions/runs/${env.GITHUB_RUN_ID}`,
  ]);
  process.stdout.write(
    "PR32 exact-head delivery check passed. Automated test reviewer; no human language review. No merge or deployment performed.\n",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runIncrementalCheck().catch(() => {
    process.stderr.write(
      "PR32 delivery check did not complete. Inspect the current status before delivery. No response details were logged.\n",
    );
    process.exitCode = 1;
  });
}
