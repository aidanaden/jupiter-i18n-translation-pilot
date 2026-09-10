import { match } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const sourceScope = Object.freeze({
  repository: "aidanaden/jupiter-i18n-translation-pilot",
  taskRef: "refs/heads/aidan/crowdin-realistic-source-check-20260910",
  number: 34,
  baseBranch: "aidan/provider-e2e-crowdin-ai-base",
  baseSha: "2d0b186918c095be3b8f91884d6e0ce3c1f7141e",
  baseTree: "e6b6804ccb711d0cb85668b3d2b6574e4d244582",
  headBranch: "aidan/crowdin-realistic-swap-20260910",
  headSha: "153b16afe2e36754f7cf0ab71944421f063fa161",
  headTree: "d15a612d6366104af6fa76ea492a03815a346130",
  files: Object.freeze([
    Object.freeze({
      path: "scripts/provider-e2e/app-catalog-cli.test.mjs",
      blob: "eb6bd75d4cb9f9dc765b4994941878ce4ceff19f",
      size: 3541,
    }),
    Object.freeze({
      path: "scripts/provider-e2e/app-cycle.test.mjs",
      blob: "9aeb77ae90db93d0529a89bc36a3d67185bfcc6d",
      size: 8465,
    }),
    Object.freeze({
      path: "scripts/provider-e2e/full-app-review.test.mjs",
      blob: "8ee6005717942aa4af709e53d833738bcc11f9c3",
      size: 34808,
    }),
    Object.freeze({
      path: "src/components/SwapExample.tsx",
      blob: "0862aa091ab36a9109a1bb412fd44c1e1da99b2f",
      size: 7646,
    }),
    Object.freeze({
      path: "src/i18n/locales/en-XA/messages.po",
      blob: "05ebc2942c1156da286b2bef98ee11c3ca422fb9",
      size: 3583,
    }),
    Object.freeze({
      path: "src/i18n/locales/en-XA/messages.ts",
      blob: "04a1757cc07216ac9d4aeca57f4efce4214b3594",
      size: 2591,
    }),
    Object.freeze({
      path: "src/i18n/locales/en/messages.po",
      blob: "58350d0295a569f236687efd14bc897e6bd5e349",
      size: 4376,
    }),
    Object.freeze({
      path: "src/i18n/locales/en/messages.ts",
      blob: "1191fea9e8d8f2e704fa0648c23dd8c3caf83569",
      size: 1602,
    }),
    Object.freeze({
      path: "src/i18n/locales/zh-Hans/messages.po",
      blob: "4acc26657404dd4829f9f445ab9da39d690f6afb",
      size: 4260,
    }),
    Object.freeze({
      path: "src/i18n/locales/zh-Hans/messages.ts",
      blob: "aa6051315bf4589719004a6a820c104fd1d4dd0e",
      size: 1532,
    }),
    Object.freeze({
      path: "src/i18n/messages.ts",
      blob: "7b15a6f344d2eee74c97863fa96bdd3ef296d5ea",
      size: 4972,
    }),
  ]),
  runId: 34498134106,
  jobId: 102941749960,
  checkSuiteId: 93455191949,
  appId: 15368,
});
const prefix = `/repos/${sourceScope.repository}`;
const sha = /^[a-f0-9]{40}$/u;

function requireValue(value) {
  if (!value) throw new Error("Approved source scope or evidence does not match");
}

function validatePr(pr) {
  requireValue(pr?.number === sourceScope.number && pr.state === "open" && pr.draft === false);
  requireValue(
    pr.base?.repo?.full_name === sourceScope.repository &&
      pr.head?.repo?.full_name === sourceScope.repository,
  );
  requireValue(pr.base.ref === sourceScope.baseBranch && pr.base.sha === sourceScope.baseSha);
  requireValue(pr.head.ref === sourceScope.headBranch && pr.head.sha === sourceScope.headSha);
}

function entries(response, expectedSha) {
  requireValue(
    response?.sha === expectedSha && response.truncated === false && Array.isArray(response.tree),
  );
  const paths = new Set();
  const result = response.tree
    .filter((entry) => entry.type !== "tree")
    .map((entry) => {
      match(entry.path, /./u);
      requireValue(
        !entry.path.includes("\0") &&
          entry.path.split("/").every((part) => part && part !== "." && part !== ".."),
      );
      requireValue(!paths.has(entry.path) && sha.test(entry.sha));
      paths.add(entry.path);
      requireValue(["100644", "100755", "120000", "160000"].includes(entry.mode));
      requireValue(entry.type === (entry.mode === "160000" ? "commit" : "blob"));
      return { path: entry.path, mode: entry.mode, type: entry.type, sha: entry.sha };
    });
  return result.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function verifySourceCheck({
  event,
  trustedHead,
  pr,
  baseTree,
  headTree,
  blobs,
  run,
  job,
  check,
}) {
  requireValue(
    event?.repository?.full_name === sourceScope.repository && event.ref === sourceScope.taskRef,
  );
  requireValue(event.deleted === false && event.forced === false && sha.test(event.after));
  requireValue(event.after === trustedHead && event.head_commit?.id === trustedHead);
  validatePr(pr);
  const base = entries(baseTree, sourceScope.baseTree);
  const head = entries(headTree, sourceScope.headTree);
  for (const file of sourceScope.files) {
    const original = base.find((entry) => entry.path === file.path);
    requireValue(original?.mode === "100644" && original.sha !== file.blob);
  }
  const expected = base.map((entry) => {
    const file = sourceScope.files.find((file) => file.path === entry.path);
    return file ? { ...entry, sha: file.blob } : entry;
  });
  requireValue(JSON.stringify(head) === JSON.stringify(expected));
  requireValue(Array.isArray(blobs) && blobs.length === sourceScope.files.length);
  requireValue(new Set(blobs.map((blob) => blob?.sha)).size === sourceScope.files.length);
  for (const file of sourceScope.files) {
    const blob = blobs.find((blob) => blob?.sha === file.blob);
    requireValue(blob?.size === file.size && blob.encoding === "base64");
    match(blob.content, /^[A-Za-z0-9+/=\r\n]*$/u);
    const bytes = Buffer.from(blob.content, "base64");
    requireValue(
      bytes.length === file.size &&
        createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") ===
          file.blob,
    );
  }
  requireValue(
    run?.id === sourceScope.runId &&
      run.run_attempt === 1 &&
      run.head_sha === sourceScope.headSha &&
      run.head_branch === sourceScope.headBranch &&
      run.event === "pull_request" &&
      run.path === ".github/workflows/ci.yml" &&
      run.check_suite_id === sourceScope.checkSuiteId,
  );
  requireValue(
    job?.id === sourceScope.jobId &&
      job.run_id === sourceScope.runId &&
      job.head_sha === sourceScope.headSha &&
      job.name === "verify" &&
      job.check_run_url === `https://api.github.com${prefix}/check-runs/${sourceScope.jobId}`,
  );
  requireValue(
    check?.id === sourceScope.jobId &&
      check.head_sha === sourceScope.headSha &&
      check.name === "verify" &&
      check.app?.id === sourceScope.appId &&
      check.check_suite?.id === sourceScope.checkSuiteId,
  );
  for (const item of [run, job, check])
    requireValue(item.status === "completed" && item.conclusion === "success");
  return Object.freeze({
    path: `${prefix}/statuses/${sourceScope.headSha}`,
    body: Object.freeze({
      state: "success",
      context: "crowdin-ai-delivery",
      description: "Verified PR34 source update; not translation approval",
      target_url: `https://github.com/${sourceScope.repository}/actions/runs/${sourceScope.runId}`,
    }),
  });
}

export async function runSourceCheck({
  env = process.env,
  fetchImpl = fetch,
  read = readFile,
  gitHead = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  summary = appendFile,
} = {}) {
  requireValue(
    env.GITHUB_EVENT_NAME === "push" &&
      env.GITHUB_REPOSITORY === sourceScope.repository &&
      env.GITHUB_REF === sourceScope.taskRef &&
      env.GH_TOKEN,
  );
  const eventText = await read(env.GITHUB_EVENT_PATH, "utf8");
  requireValue(Buffer.byteLength(eventText) <= 2000000);
  const event = JSON.parse(eventText);
  const trustedHead = gitHead();
  requireValue(event.after === env.GITHUB_SHA && trustedHead === event.after);
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GH_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  async function get(path) {
    const response = await fetchImpl(`https://api.github.com${prefix}${path}`, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    requireValue(
      response.ok && !response.redirected && !response.headers.get("link")?.includes('rel="next"'),
    );
    const reader = response.body.getReader();
    let length = 0;
    const chunks = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 5000000) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  const [pr, baseTree, headTree, blobs, run, job, check] = await Promise.all([
    get(`/pulls/${sourceScope.number}`),
    get(`/git/trees/${sourceScope.baseTree}?recursive=1`),
    get(`/git/trees/${sourceScope.headTree}?recursive=1`),
    Promise.all(sourceScope.files.map((file) => get(`/git/blobs/${file.blob}`))),
    get(`/actions/runs/${sourceScope.runId}`),
    get(`/actions/jobs/${sourceScope.jobId}`),
    get(`/check-runs/${sourceScope.jobId}`),
  ]);
  const request = verifySourceCheck({
    event,
    trustedHead,
    pr,
    baseTree,
    headTree,
    blobs,
    run,
    job,
    check,
  });
  validatePr(await get(`/pulls/${sourceScope.number}`));
  const response = await fetchImpl(`https://api.github.com${request.path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  requireValue(response.ok && !response.redirected);
  await response.body?.cancel();
  await summary(
    env.GITHUB_STEP_SUMMARY,
    `Verified source-only change for PR34 at ${sourceScope.headSha}. Only ${sourceScope.files.map((file) => file.path).join(", ")} changed. Exact CI verify check ${sourceScope.jobId} passed under Actions app 15368. Existing Chinese translations retained; six new entries blank. Not translation approval. No provider access, merge, deployment, or branch protection change.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSourceCheck().catch(() => {
    process.stderr.write(
      "Authorized PR34 source check failed validation or status publication. No credential or response content was logged.\n",
    );
    process.exitCode = 1;
  });
}
