import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCrowdinAiBaseline, stageCrowdinAiCandidate } from "./crowdin-ai-cycle.mjs";
import { nativeScope } from "./crowdin-ai-native-read.mjs";
import { finalizeCrowdinAiReview } from "./crowdin-ai-review-evidence.mjs";

const baseBranch = "aidan/provider-e2e-crowdin-ai-base";
const sourcePath = "src/i18n/locales/en/messages.po";
const targetPath = "src/i18n/locales/zh-Hans/messages.po";
const capturePath = "scripts/provider-e2e/crowdin-ai-review-capture.json";
const shaPattern = /^[a-f0-9]{40}$/u;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  requireValue(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function validatePr(pr) {
  requireValue(Number.isSafeInteger(pr?.number) && pr.number > 0, "Invalid PR number");
  requireValue(pr.state === "open" && pr.draft === false, "PR must be open and ready");
  requireValue(
    pr.base?.repo?.full_name === nativeScope.repository &&
      pr.head?.repo?.full_name === nativeScope.repository,
    "Only same-repository PRs are allowed",
  );
  requireValue(
    pr.base.ref === baseBranch &&
      /^aidan\/crowdin-ai-candidate-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(pr.head.ref),
    "Wrong PR branch",
  );
  requireValue(
    shaPattern.test(pr.base.sha) && shaPattern.test(pr.head.sha) && pr.base.sha !== pr.head.sha,
    "Invalid PR heads",
  );
  return { number: pr.number, base: pr.base.sha, head: pr.head.sha, branch: pr.head.ref };
}

export function verifyCrowdinAiDelivery(input) {
  const {
    event,
    currentPr,
    trustedHead,
    mergeBase,
    baseTreeOid,
    sourcePo,
    baselineTargetPo,
    baseTree,
    candidateTree,
    targetPo,
    capture,
    nativeSnapshot,
    now,
  } = input;
  requireValue(event?.repository?.full_name === nativeScope.repository, "Wrong event repository");
  const expected = validatePr(event.pull_request);
  equal(event.number, expected.number, "Event PR number differs");
  equal(validatePr(currentPr), expected, "PR changed since trigger");
  equal(trustedHead, expected.base, "Trusted checkout differs from PR base");
  equal(mergeBase, expected.base, "PR must descend from exact base");
  const age = Date.parse(now) - Date.parse(nativeSnapshot?.completedAt);
  requireValue(
    Number.isFinite(age) && age >= 0 && age <= 300000,
    "Native read must be no more than five minutes old",
  );
  const reviewed = finalizeCrowdinAiReview({
    capture,
    expectedCaptureDigest: capture?.digest,
    nativeSnapshot,
    sourcePo,
  });
  const manifest = {
    repository: nativeScope.repository,
    baseBranch,
    candidateBranch: expected.branch,
    baseHead: trustedHead,
    baseTreeOid,
    pinnedSourceHead: "96bbb4619507225bf663b44b221ded24b95f9777",
    projectSlug: nativeScope.projectSlug,
    projectId: nativeScope.projectId,
    branchId: null,
    fileId: nativeScope.fileId,
    sourceRevision: nativeScope.sourceRevision,
    sourceHash: "d04afe258a31159ff49d6f289142f0601fea4b5cf10bce21661eb008f945679e",
    providerLanguage: "zh-CN",
    repositoryLanguage: "zh-Hans",
    reviewerDisclosure: "Automated test reviewer. No human language review.",
  };
  const baseline = createCrowdinAiBaseline({
    manifest,
    current: { head: trustedHead, sourcePo, targetPo: baselineTargetPo, tree: baseTree },
  });
  const candidate = stageCrowdinAiCandidate({
    baseline,
    expectedManifestDigest: baseline.manifestDigest,
    current: baseline.current,
    evidence: reviewed.evidence,
    exportedPo: targetPo,
  });
  equal(
    targetPo,
    candidate.candidatePo,
    "PR payload differs from exact normalized reviewed catalog",
  );
  const oid = createHash("sha1")
    .update(`blob ${Buffer.byteLength(targetPo)}\0`)
    .update(targetPo)
    .digest("hex");
  const expectedTree = baseline.current.tree.map((entry) =>
    entry.path === targetPath ? { ...entry, oid } : entry,
  );
  const sorted = [...candidateTree].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  equal(sorted, expectedTree, "Candidate contains unrelated tree changes");
  return Object.freeze({
    status: "candidate-verified",
    repository: nativeScope.repository,
    number: expected.number,
    baseSha: trustedHead,
    headSha: expected.head,
    candidateDigest: candidate.digest,
    captureDigest: capture.digest,
    reviewReceipt: reviewed.receipt,
    atomicSnapshot: false,
    approvalTimeContentProved: false,
    humanApprovalProved: false,
    deliveryAllowed: false,
    mergeAllowed: false,
    deploymentAllowed: false,
  });
}

async function githubRead(path) {
  requireValue(
    path.startsWith(`/repos/${nativeScope.repository}/`) && process.env.GH_TOKEN,
    "GitHub read scope or token is missing",
  );
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  requireValue(response.ok && !response.redirected, "GitHub read failed");
  requireValue(
    !response.headers.get("link")?.includes('rel="next"'),
    "GitHub response was truncated",
  );
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 5000000) {
      await reader.cancel();
      throw new Error("GitHub response exceeds size limit");
    }
    chunks.push(chunk.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readBounded(path) {
  const bytes = await readFile(path);
  requireValue(bytes.length <= 2000000, "Local evidence exceeds size limit");
  return bytes.toString("utf8");
}

export async function runCrowdinAiDelivery() {
  requireValue(
    process.env.GITHUB_EVENT_NAME === "pull_request_target" &&
      process.env.GITHUB_REPOSITORY === nativeScope.repository &&
      process.env.GITHUB_REF === `refs/heads/${baseBranch}`,
    "Wrong workflow event",
  );
  const event = JSON.parse(await readBounded(process.env.GITHUB_EVENT_PATH));
  const pr = validatePr(event.pull_request);
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 5000000 });
  const trustedHead = git("rev-parse", "HEAD").trim();
  equal(trustedHead, pr.base, "Wrong trusted checkout");
  const repositoryPath = `/repos/${nativeScope.repository}`;
  const [currentPr, comparison, remoteTree] = await Promise.all([
    githubRead(`${repositoryPath}/pulls/${pr.number}`),
    githubRead(`${repositoryPath}/compare/${pr.base}...${pr.head}`),
    githubRead(`${repositoryPath}/git/trees/${pr.head}?recursive=1`),
  ]);
  requireValue(
    remoteTree.truncated === false && Array.isArray(remoteTree.tree),
    "Incomplete candidate tree",
  );
  const candidateTree = remoteTree.tree
    .filter((entry) => entry.type !== "tree")
    .map((entry) => ({ path: entry.path, mode: entry.mode, oid: entry.sha }));
  const target = candidateTree.find((entry) => entry.path === targetPath);
  requireValue(target && shaPattern.test(target.oid), "Missing candidate catalog");
  const blob = await githubRead(`${repositoryPath}/git/blobs/${target.oid}`);
  requireValue(
    blob.encoding === "base64" &&
      blob.size > 0 &&
      blob.size <= 100000 &&
      typeof blob.content === "string",
    "Invalid catalog blob",
  );
  const bytes = Buffer.from(blob.content, "base64");
  equal(bytes.length, blob.size, "Catalog blob size differs");
  const targetPo = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const baseTree = git("ls-tree", "-rz", "HEAD")
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const index = record.indexOf("\t");
      const [mode, , oid] = record.slice(0, index).split(" ");
      return { path: record.slice(index + 1), mode, oid };
    });
  const [sourcePo, baselineTargetPo, captureText, snapshotText] = await Promise.all([
    readBounded(sourcePath),
    readBounded(targetPath),
    readBounded(capturePath),
    readBounded(join(process.env.RUNNER_TEMP, "crowdin-ai-delivery-native/snapshot.json")),
  ]);
  const receipt = verifyCrowdinAiDelivery({
    event,
    currentPr,
    trustedHead,
    mergeBase: comparison.merge_base_commit?.sha,
    baseTreeOid: git("rev-parse", "HEAD^{tree}").trim(),
    sourcePo,
    baselineTargetPo,
    baseTree,
    candidateTree,
    targetPo,
    capture: JSON.parse(captureText),
    nativeSnapshot: JSON.parse(snapshotText),
    now: new Date().toISOString(),
  });
  equal(
    validatePr(await githubRead(`${repositoryPath}/pulls/${pr.number}`)),
    validatePr(currentPr),
    "PR changed during verification",
  );
  await writeFile(
    join(process.env.RUNNER_TEMP, "crowdin-ai-delivery-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `Crowdin AI candidate verified: PR ${pr.number}, head ${pr.head}.\n\nAutomated test reviewer. No human language review.\n\nAll 13 translations match the saved review capture and current native approval records. Only the target PO changed. This check does not approve a merge or deployment. Branch protection and exact-head approval remain required. Native reads are not atomic and cannot prove unchanged content throughout review.\n`,
  );
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCrowdinAiDelivery().catch(() => {
    process.stderr.write(
      "Crowdin AI delivery check failed. Verify exact PR, saved capture, current approval records and target payload. No credentials or response details were logged.\n",
    );
    process.exitCode = 1;
  });
}
