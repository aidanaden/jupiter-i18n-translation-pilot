import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareFullAppReview, verifyFullAppReview } from "./full-app-review.mjs";

function decimal(value) {
  if (!/^[1-9][0-9]{0,14}$/.test(value ?? "")) throw new Error("Invalid numeric workflow ID");
  return Number(value);
}

async function githubReader(path, env) {
  if (!path.startsWith("/repos/aidanaden/jupiter-i18n-translation-pilot/") || !env.GH_TOKEN)
    throw new Error("A repository-limited read token is required");
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub read failed: HTTP ${response.status}`);
  if (response.headers.get("link")?.includes('rel="next"'))
    throw new Error("Truncated GitHub response");
  return response.json();
}

export async function runFullAppReview(
  mode,
  { root = process.cwd(), env = process.env, readGitHub = (path) => githubReader(path, env) } = {},
) {
  if (!["prepare", "verify"].includes(mode)) throw new Error("Use prepare or verify");
  const payload = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  if (
    payload.repository?.full_name !== env.GITHUB_REPOSITORY ||
    payload.pull_request?.number !== payload.number ||
    payload.pull_request?.draft !== false ||
    payload.pull_request?.base?.repo?.full_name !== env.GITHUB_REPOSITORY ||
    payload.pull_request?.head?.repo?.full_name !== env.GITHUB_REPOSITORY
  )
    throw new Error("Invalid pull request event");
  const event = {
    repository: env.GITHUB_REPOSITORY,
    number: payload.number,
    baseBranch: payload.pull_request.base.ref,
    headBranch: payload.pull_request.head.ref,
    baseSha: payload.pull_request.base.sha,
    headSha: payload.pull_request.head.sha,
    mergeSha: env.GITHUB_SHA,
    runId: decimal(env.GITHUB_RUN_ID),
    runAttempt: decimal(env.GITHUB_RUN_ATTEMPT),
    ref: env.GITHUB_REF,
    eventName: env.GITHUB_EVENT_NAME,
  };
  const sourcePo = await readFile(join(root, "src/i18n/locales/en/messages.po"), "utf8");
  const baselineTargetPo = await readFile(
    join(root, "src/i18n/locales/zh-Hans/messages.po"),
    "utf8",
  );
  const input = { event, sourcePo, baselineTargetPo, readGitHub };
  const directory = join(root, "full-review-packet");
  if (mode === "prepare") {
    const prepared = await prepareFullAppReview(input);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "packet.json"),
      `${JSON.stringify(prepared.packet, null, 2)}\n`,
      { flag: "wx" },
    );
    await writeFile(join(directory, "REVIEW.md"), prepared.markdown, { flag: "wx" });
    await appendFile(env.GITHUB_STEP_SUMMARY, prepared.markdown);
    await appendFile(
      env.GITHUB_OUTPUT,
      `digest=${prepared.digest}\nartifact-name=${prepared.artifactName}\n`,
    );
    return prepared;
  }
  const packetText = await readFile(join(directory, "packet.json"), "utf8");
  if (Buffer.byteLength(packetText) > 1_000_000) throw new Error("Review packet is too large");
  const receipt = await verifyFullAppReview({
    ...input,
    packet: JSON.parse(packetText),
    expectedDigest: env.EXPECTED_REVIEW_DIGEST,
    artifactId: decimal(env.REVIEW_ARTIFACT_ID),
  });
  await writeFile(join(root, "full-review-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
  });
  await appendFile(
    env.GITHUB_STEP_SUMMARY,
    `# Exact-head review verified\n\nRun: ${receipt.runId}; candidate: ${receipt.headSha}\n\nReviewer account ID: ${receipt.reviewerId}. Same-account workflow test only, not qualified Chinese review.\n\nDigest: ${receipt.digest}\n\nMerge allowed: false. Deployment allowed: false. Branch protection is not checked by this workflow. The local maintainer check must verify branch protection and trusted workflow code before a request for merge or deployment approval. A passed check alone is not protection against a repository writer who can change workflow YAML.\n`,
  );
  return receipt;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runFullAppReview(process.argv[2]).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
