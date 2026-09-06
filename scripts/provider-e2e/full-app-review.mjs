import { createHash } from "node:crypto";

import { formatter } from "@lingui/format-po";
import * as z from "zod/v4-mini";

import { createAppSourcePacket } from "./app-catalog.mjs";
import { validateCatalogs } from "./offline-runner.mjs";

const repository = "aidanaden/jupiter-i18n-translation-pilot";
const baseBranch = "aidan/provider-e2e-lingo-base";
const environment = "provider-e2e-lingo-full-review";
const target = "src/i18n/locales/zh-Hans/messages.po";
const source = "src/i18n/locales/en/messages.po";
const prefix = `/repos/${repository}`;
const shaSchema = z.string().check(z.regex(/^[a-f0-9]{40}$/));
const positiveId = z.number().check(z.int(), z.positive(), z.maximum(Number.MAX_SAFE_INTEGER));
const eventSchema = z.strictObject({
  repository: z.literal(repository),
  number: positiveId,
  baseBranch: z.literal(baseBranch),
  headBranch: z
    .string()
    .check(z.regex(/^aidan\/lingo-candidate-[a-z0-9]+(?:-[a-z0-9]+)*$/), z.maxLength(100)),
  baseSha: shaSchema,
  headSha: shaSchema,
  mergeSha: shaSchema,
  runId: positiveId,
  runAttempt: z.literal(1),
  ref: z.string(),
  eventName: z.literal("pull_request"),
});

function requireValue(value, message) {
  if (!value) throw new Error(message);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function onlyTarget(files) {
  requireValue(
    Array.isArray(files) &&
      files.length === 1 &&
      files[0].filename === target &&
      files[0].status === "modified" &&
      !files[0].previous_filename,
    "Only a modification of the Chinese catalog is allowed",
  );
}

async function contents(path, sha, readGitHub) {
  const result = await readGitHub(`${prefix}/contents/${path}?ref=${sha}`);
  requireValue(
    result.type === "file" &&
      result.path === path &&
      result.encoding === "base64" &&
      result.truncated !== true &&
      Number.isInteger(result.size) &&
      result.size > 0 &&
      result.size <= 100_000 &&
      typeof result.content === "string" &&
      result.content.length <= 140_000,
    "Invalid contents response",
  );
  const encoded = result.content.replaceAll("\n", "");
  requireValue(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded),
    "Invalid base64 contents",
  );
  const bytes = Buffer.from(encoded, "base64");
  requireValue(
    bytes.toString("base64") === encoded && bytes.length === result.size,
    "Truncated or noncanonical contents",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  requireValue(!text.includes("\0") && Buffer.from(text).equals(bytes), "Invalid text contents");
  return text;
}

async function preflight(event, readGitHub) {
  requireValue(event.ref === `refs/pull/${event.number}/merge`, "Wrong pull request ref");
  const pr = await readGitHub(`${prefix}/pulls/${event.number}`);
  requireValue(
    pr.number === event.number &&
      pr.state === "open" &&
      pr.draft === false &&
      pr.base?.repo?.full_name === repository &&
      pr.head?.repo?.full_name === repository &&
      pr.base.ref === baseBranch &&
      pr.head.ref === event.headBranch &&
      pr.base.sha === event.baseSha &&
      pr.head.sha === event.headSha &&
      pr.merge_commit_sha === event.mergeSha &&
      pr.changed_files === 1 &&
      Number.isInteger(pr.commits) &&
      pr.commits >= 1 &&
      pr.commits <= 10,
    "The current pull request differs from the event",
  );
  for (const [branch, sha] of [
    [baseBranch, event.baseSha],
    [event.headBranch, event.headSha],
  ]) {
    const ref = await readGitHub(`${prefix}/git/ref/heads/${encodeURIComponent(branch)}`);
    requireValue(ref.object?.sha === sha, "The current branch changed");
  }
  const run = await readGitHub(`${prefix}/actions/runs/${event.runId}`);
  requireValue(
    run.id === event.runId &&
      run.run_attempt === 1 &&
      run.head_sha === event.headSha &&
      run.head_branch === event.headBranch &&
      run.event === "pull_request" &&
      run.repository?.full_name === repository &&
      run.path === ".github/workflows/provider-e2e-lingo-full-review.yml" &&
      Array.isArray(run.pull_requests) &&
      run.pull_requests.length === 1 &&
      run.pull_requests[0].number === event.number &&
      run.pull_requests[0].head?.sha === event.headSha &&
      run.pull_requests[0].base?.sha === event.baseSha,
    "The workflow run does not match this pull request",
  );
  const config = await readGitHub(`${prefix}/environments/${environment}`);
  requireValue(config.id === 21366555631, "Wrong review environment ID");
  requireValue(
    config.name === environment &&
      config.can_admins_bypass === false &&
      config.deployment_branch_policy?.protected_branches === false &&
      config.deployment_branch_policy?.custom_branch_policies === true &&
      Array.isArray(config.protection_rules),
    "Unsafe review environment",
  );
  const rules = config.protection_rules;
  requireValue(
    rules.filter((rule) => rule.type === "required_reviewers").length === 1 &&
      rules.filter((rule) => rule.type === "branch_policy").length === 1 &&
      rules.filter((rule) => rule.type === "wait_timer").length <= 1,
    "Missing or duplicate protection rule",
  );
  for (const rule of rules) {
    if (rule.type === "required_reviewers")
      requireValue(
        rule.prevent_self_review === false &&
          Array.isArray(rule.reviewers) &&
          rule.reviewers.length === 1 &&
          rule.reviewers[0].type === "User" &&
          rule.reviewers[0].reviewer?.id === 26812563,
        "Unexpected required reviewer",
      );
    else
      requireValue(
        rule.type === "branch_policy" || (rule.type === "wait_timer" && rule.wait_timer === 0),
        "Unknown environment protection rule",
      );
  }
  const policies = await readGitHub(
    `${prefix}/environments/${environment}/deployment-branch-policies?per_page=100`,
  );
  requireValue(
    policies.total_count === 1 &&
      Array.isArray(policies.branch_policies) &&
      policies.branch_policies.length === 1 &&
      policies.branch_policies[0].id === 59281812 &&
      policies.branch_policies[0].name === "refs/pull/*/merge" &&
      policies.branch_policies[0].type === "branch",
    "Unexpected deployment branch policy",
  );
  const protection = await readGitHub(
    `${prefix}/branches/${encodeURIComponent(baseBranch)}/protection`,
  );
  const reviews = protection.required_pull_request_reviews;
  const bypass = reviews?.bypass_pull_request_allowances;
  requireValue(
    protection.enforce_admins?.enabled === true &&
      protection.required_status_checks?.strict === true &&
      protection.required_status_checks.checks?.some(
        (check) => check.context === "lingo-delivery" && check.app_id === 15368,
      ) &&
      protection.allow_force_pushes?.enabled === false &&
      protection.allow_deletions?.enabled === false &&
      reviews &&
      bypass &&
      [bypass.users, bypass.teams, bypass.apps].every(
        (entries) => Array.isArray(entries) && entries.length === 0,
      ),
    "Unsafe isolated branch protection",
  );
  await readGitHub(`${prefix}/pulls/${event.number}/files?per_page=100`).then(onlyTarget);
  const commits = await readGitHub(`${prefix}/pulls/${event.number}/commits?per_page=100`);
  requireValue(
    Array.isArray(commits) && commits.length === pr.commits,
    "Incomplete commit history",
  );
  let parent = event.baseSha;
  for (const commit of commits) {
    z.parse(shaSchema, commit.sha);
    const detail = await readGitHub(`${prefix}/commits/${commit.sha}?per_page=100`);
    requireValue(
      detail.sha === commit.sha &&
        Array.isArray(detail.parents) &&
        detail.parents.length === 1 &&
        detail.parents[0].sha === parent,
      "Candidate history must be linear from the exact base",
    );
    onlyTarget(detail.files);
    parent = commit.sha;
  }
  requireValue(parent === event.headSha, "Commit history does not end at the candidate head");
  return { environmentId: config.id, firstDraftSha: commits[0].sha };
}

function summary(packet, digest) {
  const escape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("|", "&#124;")
      .replaceAll("`", "&#96;")
      .replaceAll("[", "&#91;")
      .replaceAll("]", "&#93;")
      .replaceAll("*", "&#42;")
      .replaceAll("_", "&#95;")
      .replaceAll("\r", "")
      .replaceAll("\n", "<br>");
  const po = formatter({ explicitIdAsDefault: true });
  const english = po.parse(packet.sourcePo);
  const raw = po.parse(packet.rawTargetPo);
  const candidate = po.parse(packet.candidatePo);
  return [
    "# Full app translation review",
    "",
    "UNREVIEWED. Read the English source, context, first committed draft, and candidate before approval.",
    "",
    "Same-account workflow-test reviewer: aidanaden. This is not qualified Chinese review or proof of independent roles. The first committed draft is not cryptographic proof of Lingo origin. No glossary is enforced. No merge or deployment is permitted by this packet.",
    "",
    `PR: ${packet.event.number}; run: ${packet.event.runId}; attempt: 1`,
    `Base: ${packet.event.baseSha}`,
    `Candidate: ${packet.event.headSha}`,
    `First draft: ${packet.firstDraftSha}`,
    `Packet SHA-256: ${digest}`,
    "",
    "| ID | English | Context | First committed draft | Candidate |",
    "| --- | --- | --- | --- | --- |",
    ...Object.keys(english).map(
      (id) =>
        `| ${[id, english[id].translation, [english[id].context ?? "", ...(english[id].comments ?? [])].join("; "), raw[id].translation, candidate[id].translation].map(escape).join(" | ")} |`,
    ),
    "",
    "A correction needs a new commit, new run, and new review. Reruns are rejected. A passed preparation check is not approval.",
    "",
  ].join("\n");
}

export async function prepareFullAppReview({
  event: inputEvent,
  sourcePo,
  baselineTargetPo,
  readGitHub,
}) {
  const event = z.parse(eventSchema, inputEvent);
  const context = await preflight(event, readGitHub);
  const remoteSource = await contents(source, event.baseSha, readGitHub);
  const remoteBaseline = await contents(target, event.baseSha, readGitHub);
  requireValue(
    sourcePo === remoteSource && baselineTargetPo === remoteBaseline,
    "Trusted local source or baseline differs from the pinned base",
  );
  createAppSourcePacket({ sourcePo, baselineTargetPo, gitHead: event.baseSha });
  const rawTargetPo = await contents(target, context.firstDraftSha, readGitHub);
  const candidatePo = await contents(target, event.headSha, readGitHub);
  for (const targetPo of [rawTargetPo, candidatePo])
    validateCatalogs({ sourcePo, targetPo, glossary: { terms: [] } });
  const packet = {
    version: "full-app-review-v1",
    event,
    ...context,
    sourcePo,
    baselineTargetPo,
    rawTargetPo,
    candidatePo,
    hashes: {
      sourcePo: hash(sourcePo),
      baselineTargetPo: hash(baselineTargetPo),
      rawTargetPo: hash(rawTargetPo),
      candidatePo: hash(candidatePo),
    },
    deliveryAllowed: false,
  };
  const digest = hash(JSON.stringify(packet));
  return {
    packet,
    digest,
    artifactName: `lingo-full-review-${event.runId}-1`,
    markdown: summary(packet, digest),
  };
}

export async function verifyFullAppReview({ packet, expectedDigest, artifactId, ...input }) {
  z.parse(positiveId, artifactId);
  requireValue(
    typeof expectedDigest === "string" && /^[a-f0-9]{64}$/.test(expectedDigest),
    "Invalid expected digest",
  );
  const current = await prepareFullAppReview(input);
  requireValue(
    current.digest === expectedDigest &&
      hash(JSON.stringify(packet)) === expectedDigest &&
      JSON.stringify(packet) === JSON.stringify(current.packet),
    "The exact review packet changed",
  );
  const { event, environmentId, firstDraftSha } = current.packet;
  const artifact = await input.readGitHub(`${prefix}/actions/artifacts/${artifactId}`);
  requireValue(
    artifact.id === artifactId &&
      artifact.name === current.artifactName &&
      artifact.expired === false &&
      artifact.workflow_run?.id === event.runId &&
      artifact.workflow_run.head_sha === event.headSha &&
      artifact.workflow_run.head_branch === event.headBranch,
    "The immutable artifact belongs to a different run or head",
  );
  const approvals = await input.readGitHub(`${prefix}/actions/runs/${event.runId}/approvals`);
  requireValue(Array.isArray(approvals), "Missing approval records");
  const relevant = approvals.filter(
    (approval) =>
      Array.isArray(approval.environments) &&
      approval.environments.some(
        (entry) => entry.id === environmentId || entry.name === environment,
      ),
  );
  requireValue(
    relevant.length === 1 &&
      relevant[0].state === "approved" &&
      relevant[0].user?.id === 26812563 &&
      relevant[0].environments.some(
        (entry) => entry.id === environmentId && entry.name === environment,
      ),
    "Missing, rejected, conflicting, or unknown human approval",
  );
  return {
    status: "reviewed-exact-head",
    digest: expectedDigest,
    repository,
    pullRequest: event.number,
    runId: event.runId,
    runAttempt: 1,
    baseSha: event.baseSha,
    headSha: event.headSha,
    firstDraftSha,
    artifactId,
    environmentId,
    reviewerId: 26812563,
    deliveryAllowed: false,
    mergeAllowed: false,
    deploymentAllowed: false,
  };
}
