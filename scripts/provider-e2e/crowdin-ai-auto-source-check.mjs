import { match } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const sourceScope = Object.freeze({
  repository: "aidanaden/jupiter-i18n-translation-pilot",
  taskRef: "refs/heads/aidan/crowdin-auto-source-check-20260910",
  number: 31,
  baseBranch: "aidan/provider-e2e-crowdin-ai-base",
  baseSha: "9189ff3e87692ba0054618dee61ef6c10aa4349b",
  baseTree: "fcedf9fc2846731c695a2ebf1eec51e5d953d140",
  headBranch: "aidan/crowdin-auto-source-20260910",
  headSha: "3fe66063f3847cddf598050d403e9549131b540a",
  headTree: "2455c1a649bd10697c920c293c8f5436cc110344",
  files: Object.freeze([
    Object.freeze({
      path: "scripts/provider-e2e/crowdin-ai-review-evidence.test.mjs",
      blob: "e3314a51cc52c8c83a689fb337ed6b3564dcba62",
      size: 12209,
    }),
    Object.freeze({
      path: "scripts/provider-e2e/full-app-review.test.mjs",
      blob: "d2ec3a7aea441b62f3791479fbcce1f089e38f5b",
      size: 34786,
    }),
    Object.freeze({
      path: "src/i18n/locales/en-XA/messages.ts",
      blob: "de31a741d0e0b1907403ecae3d83afa9ee7c645a",
      size: 2258,
    }),
    Object.freeze({
      path: "src/i18n/locales/en/messages.po",
      blob: "86fbf352bfa64589784be82b7b371ba360d748ba",
      size: 3195,
    }),
    Object.freeze({
      path: "src/i18n/locales/en/messages.ts",
      blob: "078bc64a060c72e37b5f0f9dd2988dad504578e9",
      size: 1388,
    }),
    Object.freeze({
      path: "src/i18n/locales/zh-Hans/messages.ts",
      blob: "cece46742f743a4391ebe1708bf4d3cfb0e9d453",
      size: 1302,
    }),
    Object.freeze({
      path: "src/i18n/messages.ts",
      blob: "7f18900a18ea56b9cdbff7a194decfb0939dbf7b",
      size: 3502,
    }),
    Object.freeze({
      path: "src/i18n/router-integration.test.ts",
      blob: "f5b28ce6868b6c2b7fef97335e4ce0901da92e7c",
      size: 4662,
    }),
  ]),
  runId: 34399473578,
  jobId: 102627469391,
  checkSuiteId: 93190882384,
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
      description: "Verified PR31 source update; not translation approval",
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
    `Verified source-only change for PR31 at ${sourceScope.headSha}. Only ${sourceScope.files.map((file) => file.path).join(", ")} changed. Exact CI verify check ${sourceScope.jobId} passed under Actions app 15368. Chinese PO unchanged. Not translation approval. No provider access, merge, deployment, or branch protection change.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSourceCheck().catch(() => {
    process.stderr.write(
      "Authorized PR31 source check failed validation or status publication. No credential or response content was logged.\n",
    );
    process.exitCode = 1;
  });
}
