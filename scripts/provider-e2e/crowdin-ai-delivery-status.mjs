import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "aidanaden/jupiter-i18n-translation-pilot";
const baseBranch = "aidan/provider-e2e-crowdin-ai-base";
const sha = /^[a-f0-9]{40}$/u;

function requireValue(condition) {
  if (!condition) throw new Error("Invalid Crowdin AI status scope or response");
}

function identity(pr) {
  requireValue(Number.isSafeInteger(pr?.number) && pr.number > 0);
  requireValue(pr.base?.repo?.full_name === repository && pr.head?.repo?.full_name === repository);
  requireValue(
    pr.base.ref === baseBranch &&
      /^aidan\/crowdin-ai-candidate-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(pr.head.ref),
  );
  requireValue(sha.test(pr.base.sha) && sha.test(pr.head.sha) && pr.base.sha !== pr.head.sha);
  return JSON.stringify([pr.number, pr.base.sha, pr.head.sha, pr.head.ref, pr.state, pr.draft]);
}

export function createCrowdinAiStatus({
  event,
  currentPr,
  mode,
  verifyResult,
  pendingResult,
  trustedHead,
  runId,
}) {
  requireValue(
    event?.repository?.full_name === repository && event.number === event.pull_request?.number,
  );
  const expected = identity(event.pull_request);
  requireValue(event.pull_request.state === "open" && event.pull_request.draft === false);
  requireValue(trustedHead === event.pull_request.base.sha);
  requireValue(["pending", "complete"].includes(mode) && /^[1-9][0-9]{0,19}$/u.test(runId));
  let currentMatches = false;
  try {
    currentMatches = identity(currentPr) === expected;
  } catch {
    currentMatches = false;
  }
  const state =
    mode === "pending"
      ? currentMatches
        ? "pending"
        : "failure"
      : verifyResult === "success" && pendingResult === "success" && currentMatches
        ? "success"
        : "failure";
  return {
    path: `/repos/${repository}/statuses/${event.pull_request.head.sha}`,
    body: {
      state,
      context: "crowdin-ai-delivery",
      description:
        state === "success"
          ? "Exact reviewed Crowdin catalog verified; test review only"
          : state === "pending"
            ? "Checking exact native review and candidate catalog"
            : "Crowdin review, CI, or exact-head validation failed",
      target_url: `https://github.com/${repository}/actions/runs/${runId}`,
    },
  };
}

export async function publishCrowdinAiStatus(mode) {
  requireValue(
    process.env.GITHUB_EVENT_NAME === "pull_request_target" &&
      process.env.GITHUB_REPOSITORY === repository &&
      process.env.GITHUB_REF === `refs/heads/${baseBranch}`,
  );
  const text = await readFile(process.env.GITHUB_EVENT_PATH, "utf8");
  requireValue(Buffer.byteLength(text) <= 2000000);
  const event = JSON.parse(text);
  identity(event.pull_request);
  requireValue(process.env.GH_TOKEN);
  const headers = {
    Authorization: `Bearer ${process.env.GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  let currentPr;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/pulls/${event.pull_request.number}`,
      { headers, redirect: "error", signal: AbortSignal.timeout(30000) },
    );
    requireValue(response.ok && !response.redirected);
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2000000) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(chunk.value);
    }
    currentPr = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    currentPr = undefined;
  }
  const request = createCrowdinAiStatus({
    event,
    currentPr,
    mode,
    verifyResult: process.env.VERIFY_RESULT,
    pendingResult: process.env.PENDING_RESULT,
    trustedHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    runId: process.env.GITHUB_RUN_ID,
  });
  const response = await fetch(`https://api.github.com${request.path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  requireValue(response.ok && !response.redirected);
  await response.body?.cancel();
  if (request.body.state === "failure") throw new Error("Crowdin AI status failed closed");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishCrowdinAiStatus(process.argv[2]).catch(() => {
    process.stderr.write(
      "Crowdin AI status did not pass. No credential or response details were logged.\n",
    );
    process.exitCode = 1;
  });
}
