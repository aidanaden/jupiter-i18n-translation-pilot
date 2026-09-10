import { execFile } from "node:child_process";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import * as z from "zod/v4-mini";

import { preparePrivateCandidate, verifyPrivateCandidate } from "./crowdin-private-candidate.mjs";
import {
  privateBaseSha,
  readPrivatePullRequest,
  readPrivateCi,
  readPrivateTrees,
} from "./crowdin-private-live.mjs";
import { collectPrivateReviewSnapshot } from "./crowdin-private-review-read.mjs";

const repository = "aidanaden/jupiter-i18n-translation-pilot";
const ref = "refs/heads/aidan/crowdin-private-delivery-20260911";
const baseSha = privateBaseSha;

export async function runPrivatePreparation({
  env = process.env,
  command = async (program, args) =>
    (
      await promisify(execFile)(program, args, {
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 1000000,
      })
    ).stdout,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  outputDir,
  verifyLive = false,
}) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REPOSITORY !== repository ||
    env.GITHUB_REF !== ref ||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? "") ||
    env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA ||
    env.GITHUB_WORKFLOW_REF !==
      `${repository}/.github/workflows/crowdin-private-evidence.yml@${ref}`
  )
    throw new Error("Untrusted run");
  if (
    !z.safeParse(z.string(), outputDir).success ||
    !isAbsolute(outputDir) ||
    resolve(outputDir) === "/" ||
    outputDir.includes("\0")
  )
    throw new Error("Invalid output");
  try {
    await lstat(outputDir);
    throw new Error("Output already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if ((await command("git", ["rev-parse", "HEAD"])).trim() !== env.GITHUB_SHA)
    throw new Error("Wrong checkout");
  if ((await command("git", ["status", "--porcelain", "--untracked-files=no"])).trim())
    throw new Error("Dirty checkout");
  const remoteBase = async () =>
    (
      await command("gh", [
        "api",
        "--method",
        "GET",
        `repos/${repository}/git/ref/heads/aidan/crowdin-private-source-20260911`,
        "--jq",
        ".object.sha",
      ])
    ).trim();
  if ((await remoteBase()) !== baseSha) throw new Error("Source base moved");
  const pullRequest = verifyLive ? await readPrivatePullRequest(command) : undefined;
  const ci = verifyLive ? await readPrivateCi(command) : undefined;
  await command("git", [
    "fetch",
    "--no-tags",
    "--depth=1",
    `https://github.com/${repository}.git`,
    baseSha,
  ]);
  const sourcePo = await command("git", ["show", `${baseSha}:src/i18n/locales/en/messages.po`]);
  const baselineTargetPo = await command("git", [
    "show",
    `${baseSha}:src/i18n/locales/zh-Hans/messages.po`,
  ]);
  const trees = verifyLive ? await readPrivateTrees(command, pullRequest) : undefined;
  const evidence = await collectPrivateReviewSnapshot({
    token: env.CROWDIN_PRIVATE_RECORDING_TOKEN,
    fetchImpl,
    now,
  });
  if ((await remoteBase()) !== baseSha) throw new Error("Source base moved");
  if (verifyLive) {
    if (JSON.stringify(await readPrivatePullRequest(command)) !== JSON.stringify(pullRequest))
      throw new Error("Pull request moved");
    await readPrivateCi(command);
  }
  evidence.now = now();
  const result = preparePrivateCandidate({ sourcePo, baselineTargetPo, evidence });
  const receipt = { ...result.receipt, baseSha, trustedSha: env.GITHUB_SHA, repository };
  if (verifyLive) {
    Object.assign(
      receipt,
      verifyPrivateCandidate({
        sourcePo,
        baselineTargetPo,
        evidence,
        ...trees,
        repository,
        baseBranch: pullRequest.base.ref,
        baseSha,
        currentBaseSha: baseSha,
        headSha: pullRequest.head.sha,
      }),
      {
        status: "live-candidate-verified",
        liveVerificationPerformed: true,
        pullRequestNumber: pullRequest.number,
        mergeCommitSha: pullRequest.merge_commit_sha,
        ci,
        verifiedAt: evidence.now,
        recheckRequiredBeforeDelivery: true,
      },
    );
  }
  await mkdir(outputDir, { mode: 0o700 });
  for (const [name, value] of [
    ["candidate.po", result.candidatePo],
    ["evidence.json", JSON.stringify(evidence)],
    ["receipt.json", JSON.stringify(receipt)],
  ]) {
    await writeFile(join(outputDir, name), value, { flag: "wx", mode: 0o600 });
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPrivatePreparation({
    verifyLive: true,
    outputDir: process.argv.length === 3 ? process.argv[2] : undefined,
  }).catch(() => {
    process.stderr.write("Private preparation refused. No delivery was authorized.\n");
    process.exitCode = 1;
  });
}
