import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { verifyMaintainerPreflight, verifyMaintainerReview } from "./maintainer-check.mjs";

const execute = promisify(execFile);
const prefix = "/repos/aidanaden/jupiter-i18n-translation-pilot/";

export function parseMaintainerOptions(args) {
  const [mode, ...rest] = args;
  if (!["preflight", "verify"].includes(mode) || rest.length % 2 !== 0)
    throw new Error("Use preflight or verify with an explicit --trusted-base SHA");
  const options = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    if (
      !["--trusted-base", "--run", "--artifact", "--packet-digest"].includes(name) ||
      options.has(name)
    )
      throw new Error("Unknown or duplicate option");
    options.set(name, rest[index + 1]);
  }
  const trustedBaseSha = options.get("--trusted-base");
  if (!/^[a-f0-9]{40}$/.test(trustedBaseSha ?? ""))
    throw new Error("Use the reviewed local commit SHA, not a branch name");
  if (mode === "preflight") {
    if (options.size !== 1) throw new Error("Preflight needs only --trusted-base");
    return { mode, trustedBaseSha };
  }
  for (const name of ["--run", "--artifact"])
    if (!/^[1-9][0-9]{0,14}$/.test(options.get(name) ?? ""))
      throw new Error("Invalid or missing proof ID");
  const expectedDigest = options.get("--packet-digest");
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? ""))
    throw new Error("The reviewed packet digest is required");
  return {
    mode,
    trustedBaseSha,
    runId: Number(options.get("--run")),
    artifactId: Number(options.get("--artifact")),
    expectedDigest,
  };
}

export function parseGitHubResponse(text) {
  if (Buffer.byteLength(text) > 2_000_000) throw new Error("Oversized GitHub response");
  const match = /^HTTP\/[^\s]+ 200[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(text);
  if (!match || /\blink:.*rel="?next\b/i.test(match[1]))
    throw new Error("GitHub read failed or requires pagination");
  return JSON.parse(match[2]);
}

async function run(command, args, options = {}) {
  try {
    return (
      await execute(command, args, {
        timeout: 30_000,
        maxBuffer: 2_000_000,
        encoding: "utf8",
        ...options,
      })
    ).stdout;
  } catch {
    throw new Error(`${command} read failed; no remote change was made`);
  }
}

function ghEnvironment() {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return env;
}

async function ghRead(path, binary = false) {
  if (!path.startsWith(prefix) || path.includes("..") || path.includes("#"))
    throw new Error("Only the isolated pilot repository can be read");
  const result = await run(
    "gh",
    ["api", "--hostname", "github.com", "--method", "GET", ...(binary ? [] : ["--include"]), path],
    { env: ghEnvironment(), encoding: binary ? "buffer" : "utf8" },
  );
  return binary ? result : parseGitHubResponse(result);
}

export async function readArtifactPacket(archive) {
  if (
    !Buffer.isBuffer(archive) ||
    archive.length < 4 ||
    archive.length > 2_000_000 ||
    archive.readUInt32LE(0) !== 0x04034b50
  )
    throw new Error("Invalid or oversized artifact archive");
  const directory = await mkdtemp(join(tmpdir(), "lingo-maintainer-"));
  const path = join(directory, "packet.zip");
  try {
    await writeFile(path, archive, { flag: "wx", mode: 0o600 });
    const files = (await run("unzip", ["-Z1", path])).trim().split("\n").sort();
    if (JSON.stringify(files) !== JSON.stringify(["REVIEW.md", "packet.json"]))
      throw new Error("Unexpected artifact paths");
    const text = await run("unzip", ["-p", path, "packet.json"]);
    if (Buffer.byteLength(text) > 1_000_000) throw new Error("Review packet is too large");
    return {
      packet: JSON.parse(text),
      archiveDigest: createHash("sha256").update(archive).digest("hex"),
    };
  } finally {
    await rm(path, { force: true });
    await rmdir(directory);
  }
}

async function localTrust(trustedBaseSha) {
  const actualSha = (
    await run("git", ["rev-parse", "--verify", `${trustedBaseSha}^{commit}`])
  ).trim();
  if (actualSha !== trustedBaseSha) throw new Error("The reviewed commit is not present locally");
  const treeText = await run("git", ["ls-tree", "-r", "-z", trustedBaseSha]);
  const trustedTree = treeText
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\t(.+)$/.exec(line);
      if (!match) throw new Error("Invalid local Git tree");
      return { mode: match[1], type: match[2], sha: match[3], path: match[4] };
    });
  const sourcePo = await run("git", ["show", `${trustedBaseSha}:src/i18n/locales/en/messages.po`]);
  const baselineTargetPo = await run("git", [
    "show",
    `${trustedBaseSha}:src/i18n/locales/zh-Hans/messages.po`,
  ]);
  return { trustedTree, sourcePo, baselineTargetPo };
}

export async function runMaintainerCheck(args) {
  const options = parseMaintainerOptions(args);
  const trusted = await localTrust(options.trustedBaseSha);
  const input = { ...options, ...trusted, readGitHub: ghRead };
  if (options.mode === "preflight") return verifyMaintainerPreflight(input);
  const metadata = await ghRead(`${prefix}actions/artifacts/${options.artifactId}`);
  if (
    metadata.id !== options.artifactId ||
    metadata.expired !== false ||
    metadata.workflow_run?.id !== options.runId ||
    !Number.isSafeInteger(metadata.size_in_bytes) ||
    metadata.size_in_bytes < 1 ||
    metadata.size_in_bytes > 2_000_000 ||
    !/^sha256:[a-f0-9]{64}$/.test(metadata.digest ?? "")
  )
    throw new Error("Invalid artifact metadata");
  const archive = await ghRead(`${prefix}actions/artifacts/${options.artifactId}/zip`, true);
  const digest = createHash("sha256").update(archive).digest("hex");
  if (metadata.digest !== `sha256:${digest}`)
    throw new Error("Downloaded artifact digest does not match GitHub");
  const downloaded = await readArtifactPacket(archive);
  if (downloaded.packet.event?.runId !== options.runId)
    throw new Error("The packet belongs to another run");
  return verifyMaintainerReview({ ...input, ...downloaded, event: downloaded.packet.event });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMaintainerCheck(process.argv.slice(2))
    .then((receipt) => {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      process.stderr.write(
        "This is a read-only check. It does not grant merge or deployment approval. Run it again immediately before an approved action.\n",
      );
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
