import { verifyFullAppReview } from "./full-app-review.mjs";

const repository = "aidanaden/jupiter-i18n-translation-pilot";
const prefix = `/repos/${repository}`;
const baseBranch = "aidan/provider-e2e-lingo-base";
const target = "src/i18n/locales/zh-Hans/messages.po";
const workflow = ".github/workflows/provider-e2e-lingo-full-review.yml";
const shaPattern = /^[a-f0-9]{40}$/;

function requireValue(value, message) {
  if (!value) throw new Error(message);
}

function canonicalTree(entries) {
  requireValue(
    Array.isArray(entries) && entries.length > 0 && entries.length < 5000,
    "Invalid or incomplete trusted tree",
  );
  const files = entries
    .filter((entry) => entry.type !== "tree")
    .map((entry) => {
      requireValue(
        typeof entry.path === "string" &&
          !entry.path.includes("\0") &&
          entry.type === "blob" &&
          ["100644", "100755"].includes(entry.mode) &&
          shaPattern.test(entry.sha),
        "Invalid tree entry",
      );
      return { path: entry.path, mode: entry.mode, type: entry.type, sha: entry.sha };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  requireValue(
    new Set(files.map((entry) => entry.path)).size === files.length,
    "Duplicate tree path",
  );
  for (const path of [
    workflow,
    "scripts/provider-e2e/full-app-review.mjs",
    "scripts/provider-e2e/full-app-review-cli.mjs",
    "package.json",
    "pnpm-lock.yaml",
    target,
  ])
    requireValue(
      files.some((entry) => entry.path === path),
      "Missing trusted executable or catalog",
    );
  return files;
}

async function compareTree(sha, trustedTree, readGitHub, allowTargetChange, event) {
  requireValue(shaPattern.test(sha), "Invalid Git SHA");
  const commit = await readGitHub(`${prefix}/git/commits/${sha}`);
  requireValue(commit.sha === sha && shaPattern.test(commit.tree?.sha), "Wrong remote commit");
  if (event && sha === event.mergeSha)
    requireValue(
      Array.isArray(commit.parents) &&
        commit.parents.length === 2 &&
        commit.parents[0].sha === event.baseSha &&
        commit.parents[1].sha === event.headSha,
      "Wrong merge parents",
    );
  const response = await readGitHub(`${prefix}/git/trees/${commit.tree.sha}?recursive=1`);
  requireValue(
    response.sha === commit.tree.sha && response.truncated === false,
    "Truncated or wrong remote tree",
  );
  const remoteTree = canonicalTree(response.tree);
  const withoutTarget = (entries) =>
    entries.filter((entry) => !allowTargetChange || entry.path !== target);
  requireValue(
    JSON.stringify(withoutTarget(remoteTree)) === JSON.stringify(withoutTarget(trustedTree)),
    "Remote executable or workflow differs from the reviewed local base",
  );
}

async function checkProtection(readGitHub) {
  const protection = await readGitHub(
    `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`,
  );
  const reviews = protection.required_pull_request_reviews;
  const bypass = reviews?.bypass_pull_request_allowances;
  requireValue(
    protection.enforce_admins?.enabled === true &&
      protection.required_status_checks?.strict === true &&
      protection.required_status_checks.checks?.length === 1 &&
      protection.required_status_checks.checks[0].context === "lingo-delivery" &&
      protection.required_status_checks.checks[0].app_id === 15368 &&
      protection.allow_force_pushes?.enabled === false &&
      protection.allow_deletions?.enabled === false &&
      protection.required_linear_history?.enabled === true &&
      protection.required_conversation_resolution?.enabled === true &&
      protection.lock_branch?.enabled === false &&
      protection.block_creations?.enabled === false &&
      protection.allow_fork_syncing?.enabled === false &&
      protection.restrictions == null &&
      reviews?.required_approving_review_count === 0 &&
      reviews.dismiss_stale_reviews === true &&
      reviews.require_code_owner_reviews === false &&
      reviews.require_last_push_approval === false &&
      bypass &&
      [bypass.users, bypass.teams, bypass.apps].every(
        (entries) => Array.isArray(entries) && entries.length === 0,
      ),
    "Unsafe isolated branch protection",
  );
}

export async function verifyMaintainerPreflight({
  trustedBaseSha,
  trustedTree: entries,
  readGitHub,
}) {
  requireValue(shaPattern.test(trustedBaseSha), "An explicit reviewed local base SHA is required");
  await checkProtection(readGitHub);
  const trustedTree = canonicalTree(entries);
  const ref = await readGitHub(`${prefix}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  requireValue(ref.object?.sha === trustedBaseSha, "The current isolated base changed");
  await compareTree(trustedBaseSha, trustedTree, readGitHub, false);
  return {
    status: "maintainer-preflight-verified",
    repository,
    baseSha: trustedBaseSha,
    branchProtectionVerified: true,
    deliveryAllowed: false,
    mergeAllowed: false,
    deploymentAllowed: false,
    freshVerificationRequiredBeforeAction: true,
  };
}

export async function verifyMaintainerReview({
  trustedBaseSha,
  trustedTree: entries,
  archiveDigest,
  ...input
}) {
  requireValue(
    input.event?.baseSha === trustedBaseSha,
    "The event base differs from the reviewed local base",
  );
  await verifyMaintainerPreflight({
    trustedBaseSha,
    trustedTree: entries,
    readGitHub: input.readGitHub,
  });
  const trustedTree = canonicalTree(entries);
  for (const sha of [input.event.headSha, input.event.mergeSha])
    await compareTree(sha, trustedTree, input.readGitHub, true, input.event);
  const receipt = await verifyFullAppReview(input);
  const artifact = await input.readGitHub(`${prefix}/actions/artifacts/${input.artifactId}`);
  requireValue(
    typeof archiveDigest === "string" &&
      /^[a-f0-9]{64}$/.test(archiveDigest) &&
      artifact.digest === `sha256:${archiveDigest}`,
    "Downloaded archive digest differs from the immutable artifact",
  );
  const run = await input.readGitHub(`${prefix}/actions/runs/${input.event.runId}`);
  requireValue(
    run.status === "completed" && run.conclusion === "success",
    "The actual workflow is not complete and successful",
  );
  const result = await input.readGitHub(
    `${prefix}/actions/runs/${input.event.runId}/attempts/1/jobs?per_page=100`,
  );
  requireValue(
    result.total_count === 3 &&
      Array.isArray(result.jobs) &&
      result.jobs.length === 3 &&
      new Set(result.jobs.map((job) => job.id)).size === 3,
    "Incomplete or duplicate workflow jobs",
  );
  for (const name of ["prepare", "reviewed", "lingo-delivery"]) {
    const jobs = result.jobs.filter((job) => job.name === name);
    requireValue(
      jobs.length === 1 &&
        Number.isSafeInteger(jobs[0].id) &&
        jobs[0].id > 0 &&
        jobs[0].run_id === input.event.runId &&
        jobs[0].run_attempt === 1 &&
        jobs[0].head_sha === input.event.headSha &&
        jobs[0].status === "completed" &&
        jobs[0].conclusion === "success",
      "Missing, skipped, or mismatched workflow job",
    );
  }
  await checkProtection(input.readGitHub);
  const finalReceipt = await verifyFullAppReview(input);
  requireValue(
    JSON.stringify(receipt) === JSON.stringify(finalReceipt),
    "Review evidence changed during verification",
  );
  return {
    ...receipt,
    status: "ready-for-user-approval",
    branchProtectionVerified: true,
    maintainerVerificationRequired: false,
    trustedBaseSha,
    artifactArchiveDigest: archiveDigest,
    verifiedAt: new Date().toISOString(),
    freshVerificationRequiredBeforeAction: true,
  };
}
