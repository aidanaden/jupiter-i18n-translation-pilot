import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatter } from "@lingui/format-po";
import * as z from "zod/v4-mini";

import { createReviewArtifact, verifyReviewArtifact } from "./review-artifact.mjs";

const repository = "aidanaden/jupiter-i18n-translation-pilot";
const branch = "aidan/provider-e2e-lingo-01";
const environment = "provider-e2e-lingo-review";
const workflow = ".github/workflows/provider-e2e-lingo-review.yml";
const hashSchema = z.string().check(z.regex(/^[a-f0-9]{40}$/));
const positiveId = z.number().check(z.int(), z.positive());
const decimalId = z.string().check(z.regex(/^[1-9][0-9]{0,14}$/));
const eventSchema = z.strictObject({
  repository: z.literal(repository),
  ref: z.literal(`refs/heads/${branch}`),
  gitHead: hashSchema,
  runId: decimalId,
  runAttempt: z.literal("1"),
  event: z.literal("push"),
});
const runSchema = z.object({
  id: positiveId,
  run_attempt: z.literal(1),
  head_sha: hashSchema,
  head_branch: z.literal(branch),
  event: z.literal("push"),
  repository: z.object({ full_name: z.literal(repository) }),
  path: z.literal(workflow),
});
const environmentSchema = z.object({
  id: z.literal(21361554249),
  name: z.literal(environment),
  can_admins_bypass: z.literal(false),
  protection_rules: z.array(
    z.union([
      z.object({
        type: z.literal("required_reviewers"),
        prevent_self_review: z.literal(false),
        reviewers: z
          .array(
            z.object({ type: z.literal("User"), reviewer: z.object({ id: z.literal(26812563) }) }),
          )
          .check(z.length(1)),
      }),
      z.object({ type: z.literal("branch_policy") }),
      z.object({ type: z.literal("wait_timer"), wait_timer: z.literal(0) }),
    ]),
  ),
  deployment_branch_policy: z.object({
    protected_branches: z.literal(false),
    custom_branch_policies: z.literal(true),
  }),
});
const policiesSchema = z.object({
  total_count: z.literal(1),
  branch_policies: z
    .array(
      z.object({ id: z.literal(59274364), name: z.literal(branch), type: z.literal("branch") }),
    )
    .check(z.length(1)),
});
const artifactSchema = z.object({
  id: positiveId,
  name: z.string(),
  expired: z.literal(false),
  workflow_run: z.object({ id: positiveId, head_sha: hashSchema, head_branch: z.literal(branch) }),
});

function currentRun(env) {
  const event = z.parse(eventSchema, {
    repository: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF,
    gitHead: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    event: env.GITHUB_EVENT_NAME,
  });
  return { gitHead: event.gitHead, runId: Number(event.runId), runAttempt: 1 };
}

async function preflight(run, readGitHub) {
  const base = `/repos/${repository}`;
  const actual = z.parse(runSchema, await readGitHub(`${base}/actions/runs/${run.runId}`));
  const ref = z.parse(
    z.object({ object: z.object({ sha: hashSchema }) }),
    await readGitHub(`${base}/git/ref/heads/${encodeURIComponent(branch)}`),
  );
  if (actual.id !== run.runId || actual.head_sha !== run.gitHead || ref.object.sha !== run.gitHead)
    throw new Error("The workflow run or current branch HEAD changed");
  const config = z.parse(
    environmentSchema,
    await readGitHub(`${base}/environments/${environment}`),
  );
  if (config.protection_rules.filter((rule) => rule.type === "required_reviewers").length !== 1)
    throw new Error("The environment must have exactly one required reviewer rule");
  z.parse(
    policiesSchema,
    await readGitHub(`${base}/environments/${environment}/deployment-branch-policies?per_page=100`),
  );
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function preparePacket(root, run, io) {
  const read = (path) => io.readFile(join(root, "scripts/provider-e2e", path), "utf8");
  const sourcePo = await read("live-lingo/locales/en.po");
  const rawTargetJson = await read("live-lingo-json/locales/zh-Hans.json");
  const rawTargetPo = await read("live-lingo-json/derived/zh-Hans.po");
  if (
    sha256(sourcePo) !== "1c99ecd43b9ff06f2958e7aa3b5ea1a169847cfe1f8c71ad9c9453b94c1ba1a1" ||
    sha256(rawTargetJson) !== "617f491a8ad147c94612dad71e8d090f46623cd5a44d077835504675f7fb4df5" ||
    sha256(rawTargetPo) !== "2ff9e41327943631c0c08945cbf0defd9725628c09fc6816a6c60ac0502a62e1"
  )
    throw new Error("The saved source or original AI draft changed");
  const config = z.parse(
    z.strictObject({
      orgId: z.literal("org_yOdeUVJptYpiIIcjKexh"),
      engineId: z.literal("eng_s8sAdrF2lrMnWj94r7kd"),
      sourceLocale: z.literal("en"),
      targetLocales: z.tuple([z.literal("zh-Hans")]),
      files: z.tuple([z.strictObject({ pattern: z.literal("locales/en.json") })]),
    }),
    JSON.parse(await read("live-lingo-json/.lingo/config.json")),
  );
  return {
    ...run,
    attempt: `lingo-review-${run.runId}-1`,
    sourcePo,
    rawTargetPo,
    rawTargetJson,
    targetPo: await read("live-lingo-json/review-candidate/zh-Hans.po"),
    glossaryText: JSON.stringify({ terms: [], status: "not-configured" }),
    engineConfigText: JSON.stringify({
      config,
      group: "lrg_b42kvO7rjZdixQcWhBK7",
      job: "ljb_yuFG9A1X7dqCSWXRq6VR",
      sourceCommentsSent: false,
      serverSettingsRechecked: false,
    }),
  };
}

function reviewSummary(packet, digest) {
  const escape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("|", "&#124;")
      .replaceAll("`", "&#96;")
      .replaceAll("\n", "<br>");
  const parse = formatter({ explicitIdAsDefault: true }).parse;
  const source = parse(packet.sourcePo);
  const raw = parse(packet.rawTargetPo);
  const candidate = parse(packet.targetPo);
  return [
    "# Lingo human-review workflow test",
    "",
    "UNREVIEWED. Read each source, context comment, original AI draft, and candidate before using the environment review control. No language approval is claimed by this script.",
    "",
    "The existing account is the temporary test reviewer. This does not prove independent roles or qualified Chinese review. The glossary is empty. The AI did not receive the source comments. This workflow cannot deploy, merge, or approve delivery.",
    "",
    `Run: ${packet.runId}; attempt: ${packet.runAttempt}; HEAD: ${packet.gitHead}`,
    `Packet SHA-256: ${digest}`,
    ...[
      "sourcePo",
      "rawTargetJson",
      "rawTargetPo",
      "targetPo",
      "glossaryText",
      "engineConfigText",
    ].map((key) => `${key} SHA-256: ${sha256(packet[key])}`),
    "",
    "Source: scripts/provider-e2e/live-lingo/locales/en.po",
    "Candidate: scripts/provider-e2e/live-lingo-json/review-candidate/zh-Hans.po",
    "Original AI JSON: scripts/provider-e2e/live-lingo-json/locales/zh-Hans.json",
    "Original derived PO: scripts/provider-e2e/live-lingo-json/derived/zh-Hans.po",
    "",
    "| ID | English source | Context | Original AI draft | Candidate to review |",
    "| --- | --- | --- | --- | --- |",
    ...Object.keys(source).map(
      (id) =>
        `| ${[id, source[id].translation, (source[id].comments ?? []).join("; "), raw[id].translation, candidate[id].translation].map(escape).join(" | ")} |`,
    ),
    "",
    `Engine capture: ${escape(packet.engineConfigText)}`,
    "",
    "Download the immutable artifact to inspect the exact packet. Corrections require a new commit and a new workflow run. Reruns are rejected. An environment action is a workflow-test action, not permission to release translations.",
    "",
  ].join("\n");
}

export async function runReviewTest(
  mode,
  {
    root = process.cwd(),
    env = process.env,
    readGitHub = githubReader(env),
    io = { readFile, writeFile, mkdir, appendFile },
  } = {},
) {
  if (mode !== "prepare" && mode !== "verify") throw new Error("Use prepare or verify");
  const run = currentRun(env);
  await preflight(run, readGitHub);
  const directory = join(root, "review-packet");
  if (mode === "prepare") {
    const packet = await preparePacket(root, run, io);
    const result = createReviewArtifact(packet);
    await io.mkdir(directory, { recursive: true });
    await io.writeFile(join(directory, "packet.json"), `${JSON.stringify(packet, null, 2)}\n`, {
      flag: "wx",
    });
    const summary = reviewSummary(packet, result.digest);
    await io.writeFile(join(directory, "REVIEW.md"), summary, { flag: "wx" });
    await io.appendFile(env.GITHUB_STEP_SUMMARY, summary);
    await io.appendFile(
      env.GITHUB_OUTPUT,
      `digest=${result.digest}\nartifact-name=lingo-review-${run.runId}-1\n`,
    );
    return result;
  }
  const artifactId = Number(z.parse(decimalId, env.REVIEW_ARTIFACT_ID));
  const artifact = z.parse(
    artifactSchema,
    await readGitHub(`/repos/${repository}/actions/artifacts/${artifactId}`),
  );
  if (
    artifact.id !== artifactId ||
    artifact.name !== `lingo-review-${run.runId}-1` ||
    artifact.workflow_run.id !== run.runId ||
    artifact.workflow_run.head_sha !== run.gitHead
  )
    throw new Error("The artifact is not from this exact workflow run");
  const packet = JSON.parse(await io.readFile(join(directory, "packet.json"), "utf8"));
  const result = verifyReviewArtifact(packet, env.EXPECTED_REVIEW_DIGEST, run);
  const expectedPacket = await preparePacket(root, run, io);
  if (createReviewArtifact(expectedPacket).digest !== result.digest)
    throw new Error("The downloaded packet differs from the checked-out files");
  await io.writeFile(join(root, "review-receipt.json"), `${JSON.stringify(result, null, 2)}\n`, {
    flag: "wx",
  });
  await io.appendFile(
    env.GITHUB_STEP_SUMMARY,
    `# Review test integrity result\n\nExact artifact and run verified after the environment job boundary.\n\nDigest: ${result.digest}\n\nLanguage approval: not asserted. Delivery allowed: false. No deployment or merge.\n`,
  );
  return result;
}

function githubReader(env) {
  return async (path) => {
    if (!path.startsWith(`/repos/${repository}/`)) throw new Error("Unexpected GitHub API path");
    if (!env.GH_TOKEN) throw new Error("A read-only GitHub token is required");
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`GitHub read failed (${response.status}); no workflow result issued`);
    return response.json();
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runReviewTest(process.argv[2]).catch(() => {
    process.stderr.write(
      "Review test failed. Check run identity, read access, environment policy, and exact artifact content. No delivery is permitted.\n",
    );
    process.exitCode = 1;
  });
}
