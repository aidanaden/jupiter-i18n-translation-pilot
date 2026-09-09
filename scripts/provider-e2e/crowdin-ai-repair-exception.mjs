import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repairScope = Object.freeze({
  repository: "aidanaden/jupiter-i18n-translation-pilot",
  taskRef: "refs/heads/aidan/crowdin-ai-recording-02",
  number: 27,
  baseBranch: "aidan/provider-e2e-crowdin-ai-base",
  baseSha: "e317c1d76b0a813954c0f46063047f8f15f1942c",
  baseTree: "d1c1b3f02e09fadbba55c79831e14c8bd7065819",
  headBranch: "aidan/crowdin-ai-base-test-repair",
  headSha: "e5abbe987f62c509630e6659def648bdad64ae9a",
  headTree: "c52b31b71d29ceeace3f800970e1e57094cc1469",
  path: "scripts/ssr-workflow.test.mjs",
  blob: "6486f6ced8e2f20f0f391f6365267d2127f506ac",
  size: 2268,
  runId: 34293094835,
  jobId: 102283723386,
  checkSuiteId: 92899598072,
  appId: 15368,
});
const prefix = `/repos/${repairScope.repository}`;
const sha = /^[a-f0-9]{40}$/u;

function requireValue(value) {
  if (!value) throw new Error("Authorized repair scope or evidence does not match");
}

function validatePr(pr) {
  requireValue(pr?.number === repairScope.number && pr.state === "open" && pr.draft === false);
  requireValue(
    pr.base?.repo?.full_name === repairScope.repository &&
      pr.head?.repo?.full_name === repairScope.repository,
  );
  requireValue(pr.base.ref === repairScope.baseBranch && pr.base.sha === repairScope.baseSha);
  requireValue(pr.head.ref === repairScope.headBranch && pr.head.sha === repairScope.headSha);
}

function entries(response, expectedSha) {
  requireValue(
    response?.sha === expectedSha && response.truncated === false && Array.isArray(response.tree),
  );
  const paths = new Set();
  const result = response.tree
    .filter((entry) => entry.type !== "tree")
    .map((entry) => {
      requireValue(
        typeof entry.path === "string" &&
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

export function verifyRepairException({
  event,
  trustedHead,
  pr,
  baseTree,
  headTree,
  blob,
  run,
  job,
  check,
}) {
  requireValue(
    event?.repository?.full_name === repairScope.repository && event.ref === repairScope.taskRef,
  );
  requireValue(event.deleted === false && event.forced === false && sha.test(event.after));
  requireValue(event.after === trustedHead && event.head_commit?.id === trustedHead);
  validatePr(pr);
  const base = entries(baseTree, repairScope.baseTree);
  const head = entries(headTree, repairScope.headTree);
  const original = base.find((entry) => entry.path === repairScope.path);
  requireValue(original?.mode === "100644" && original.sha !== repairScope.blob);
  const expected = base.map((entry) =>
    entry.path === repairScope.path ? { ...entry, sha: repairScope.blob } : entry,
  );
  requireValue(JSON.stringify(head) === JSON.stringify(expected));
  requireValue(
    blob?.sha === repairScope.blob &&
      blob.size === repairScope.size &&
      blob.encoding === "base64" &&
      typeof blob.content === "string",
  );
  const bytes = Buffer.from(blob.content, "base64");
  requireValue(
    bytes.length === repairScope.size &&
      createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") ===
        repairScope.blob,
  );
  requireValue(
    run?.id === repairScope.runId &&
      run.head_sha === repairScope.headSha &&
      run.head_branch === repairScope.headBranch &&
      run.event === "pull_request" &&
      run.path === ".github/workflows/ci.yml" &&
      run.check_suite_id === repairScope.checkSuiteId,
  );
  requireValue(
    job?.id === repairScope.jobId &&
      job.run_id === repairScope.runId &&
      job.head_sha === repairScope.headSha &&
      job.name === "verify" &&
      job.check_run_url === `https://api.github.com${prefix}/check-runs/${repairScope.jobId}`,
  );
  requireValue(
    check?.id === repairScope.jobId &&
      check.head_sha === repairScope.headSha &&
      check.name === "verify" &&
      check.app?.id === repairScope.appId &&
      check.check_suite?.id === repairScope.checkSuiteId,
  );
  for (const item of [run, job, check])
    requireValue(item.status === "completed" && item.conclusion === "success");
  return Object.freeze({
    path: `${prefix}/statuses/${repairScope.headSha}`,
    body: Object.freeze({
      state: "success",
      context: "crowdin-ai-delivery",
      description: "Authorized test-only repair exception; no translations changed",
      target_url: `https://github.com/${repairScope.repository}/actions/runs/${repairScope.runId}`,
    }),
  });
}

export async function runRepairException({
  env = process.env,
  fetchImpl = fetch,
  read = readFile,
  gitHead = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  summary = appendFile,
} = {}) {
  requireValue(
    env.GITHUB_EVENT_NAME === "push" &&
      env.GITHUB_REPOSITORY === repairScope.repository &&
      env.GITHUB_REF === repairScope.taskRef &&
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
  const [pr, baseTree, headTree, blob, run, job, check] = await Promise.all([
    get(`/pulls/${repairScope.number}`),
    get(`/git/trees/${repairScope.baseTree}?recursive=1`),
    get(`/git/trees/${repairScope.headTree}?recursive=1`),
    get(`/git/blobs/${repairScope.blob}`),
    get(`/actions/runs/${repairScope.runId}`),
    get(`/actions/jobs/${repairScope.jobId}`),
    get(`/check-runs/${repairScope.jobId}`),
  ]);
  const request = verifyRepairException({
    event,
    trustedHead,
    pr,
    baseTree,
    headTree,
    blob,
    run,
    job,
    check,
  });
  validatePr(await get(`/pulls/${repairScope.number}`));
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
    `Authorized test-only repair exception for PR27 at ${repairScope.headSha}. Only ${repairScope.path} changed. Exact CI verify check ${repairScope.jobId} passed under Actions app15368. No translations changed. No provider access, merge, deployment, or branch protection change.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRepairException().catch(() => {
    process.stderr.write(
      "Authorized PR27 repair exception failed validation or status publication. No credential or response content was logged.\n",
    );
    process.exitCode = 1;
  });
}
