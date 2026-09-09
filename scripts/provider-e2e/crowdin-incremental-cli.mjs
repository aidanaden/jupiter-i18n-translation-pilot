import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NativeSourceMismatchError,
  incrementalScope,
  prepareIncrementalDelivery,
  verifyIncrementalCandidate,
} from "./crowdin-incremental-delivery.mjs";
import { collectIncrementalSnapshot } from "./crowdin-incremental-read.mjs";

export async function runIncrementalCli(args, { runCommand = execFileSync } = {}) {
  const [mode, outputPath, candidate] = args;
  if (
    !outputPath ||
    (mode !== "prepare" && mode !== "verify") ||
    args.length !== (mode === "verify" ? 3 : 2) ||
    (mode === "verify" && !/^[a-f0-9]{40}$/u.test(candidate))
  )
    throw new Error("Usage: prepare OUTPUT or verify OUTPUT FULL_COMMIT_SHA");
  if (
    process.env.GITHUB_EVENT_NAME &&
    (mode !== "prepare" ||
      process.env.GITHUB_EVENT_NAME !== "push" ||
      process.env.GITHUB_REPOSITORY !== incrementalScope.repository ||
      process.env.GITHUB_REF !== "refs/heads/aidan/crowdin-incremental-delivery-20260910")
  )
    throw new Error("Unapproved workflow context");
  const git = (...gitArgs) =>
    runCommand("git", gitArgs, {
      encoding: "utf8",
      maxBuffer: 5000000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const currentBase = () => {
    const sha = runCommand(
      "gh",
      [
        "api",
        `repos/${incrementalScope.repository}/git/ref/heads/${incrementalScope.baseBranch}`,
        "--jq",
        ".object.sha",
      ],
      { encoding: "utf8", maxBuffer: 10000, stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error("Invalid remote base");
    return sha;
  };
  if (process.env.GITHUB_EVENT_NAME && git("rev-parse", "HEAD").trim() !== process.env.GITHUB_SHA)
    throw new Error("Wrong trusted workflow checkout");
  const baseSha = currentBase();
  const sourcePo = git("show", `${baseSha}:src/i18n/locales/en/messages.po`);
  const baselineTargetPo = git("show", `${baseSha}:src/i18n/locales/zh-Hans/messages.po`);
  const snapshot = await collectIncrementalSnapshot({ token: process.env.CROWDIN_PERSONAL_TOKEN });
  const now = new Date().toISOString();
  const input = { sourcePo, baselineTargetPo, snapshot, now };
  const prepared = prepareIncrementalDelivery(input);
  let receipt = {
    ...prepared.receipt,
    baseSha,
    repository: incrementalScope.repository,
    baseBranch: incrementalScope.baseBranch,
  };
  if (mode === "verify") {
    const tree = (ref) =>
      git("ls-tree", "-rz", ref)
        .split("\0")
        .filter(Boolean)
        .map((record) => {
          const index = record.indexOf("\t");
          const [entryMode, , oid] = record.slice(0, index).split(" ");
          return { path: record.slice(index + 1), mode: entryMode, oid };
        });
    const resolved = git("rev-parse", `${candidate}^{commit}`).trim();
    if (resolved !== candidate) throw new Error("Candidate must name a commit");
    receipt = verifyIncrementalCandidate({
      ...input,
      repository: incrementalScope.repository,
      baseBranch: incrementalScope.baseBranch,
      baseSha,
      currentBaseSha: currentBase(),
      headSha: candidate,
      mergeBase: git("merge-base", baseSha, candidate).trim(),
      candidatePo: git("show", `${candidate}:src/i18n/locales/zh-Hans/messages.po`),
      baseTree: tree(baseSha),
      candidateTree: tree(candidate),
    });
  }
  if (currentBase() !== baseSha) throw new Error("Remote base changed during preparation");
  prepareIncrementalDelivery({ ...input, now: new Date().toISOString() });
  const output = resolve(outputPath);
  await mkdir(output, { mode: 0o700 });
  for (const [name, contents] of [
    ["candidate.po", prepared.candidatePo],
    ["snapshot.json", `${JSON.stringify(snapshot, null, 2)}\n`],
    ["receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
  ])
    await writeFile(resolve(output, name), contents, { flag: "wx", mode: 0o600 });
  process.stdout.write(
    "Prepared one reviewed message; preserved12 accepted entries. No status, merge, or deployment authorized.\n",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runIncrementalCli(process.argv.slice(2)).catch((error) => {
    const safeMessages = new Set([
      "Native read refused",
      "Wrong native file",
      "Wrong integration branch",
      "Wrong directory chain",
      "Unexpected parent directory",
      "Wrong source scope",
      "Native state changed between reads",
      "Corrected translation differs from test review",
      "Approval does not match corrected translation and reviewer",
      "One current translation and approval are required",
      "Native source changed",
      "Invalid native ID",
      "Native source identifiers differ",
      "Approval or correction predates source, or is in the future",
    ]);
    if (safeMessages.has(error?.message)) process.stderr.write(`Check failed: ${error.message}.\n`);
    if (error instanceof NativeSourceMismatchError)
      process.stderr.write(`Source check facts: ${JSON.stringify(error.facts)}\n`);
    process.stderr.write(
      "Incremental preparation failed. No authorization was issued. Check inputs and access without logging credentials.\n",
    );
    process.exitCode = 1;
  });
}
