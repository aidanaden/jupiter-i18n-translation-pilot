import { createHash } from "node:crypto";

import * as z from "zod/v4-mini";

import { checkPrivateReview } from "./crowdin-private-review-check.mjs";
import { validateCatalogs } from "./offline-runner.mjs";

function hash(value) {
  return createHash("sha256").update(z.parse(z.string(), value)).digest("hex");
}

export function preparePrivateCandidate({ sourcePo, baselineTargetPo, evidence }) {
  if (hash(sourcePo) !== "d54a92561e19f365b5a66e6c912e14414a0afe2fef78bec62074ab05e842cc5e") {
    throw new Error("Source hash differs");
  }
  if (
    hash(baselineTargetPo) !== "48c337473fda22dcaf9360474d892ca6927c610e77cc20852e2e411a91e64054"
  ) {
    throw new Error("Baseline target hash differs");
  }
  const review = checkPrivateReview(evidence);
  let candidatePo = baselineTargetPo;
  for (const entry of evidence.first.entries) {
    const oldEntry = `msgid ${JSON.stringify(entry.identifier)}\nmsgstr ""`;
    if (candidatePo.split(oldEntry).length !== 2)
      throw new Error("Blank target entry is ambiguous");
    candidatePo = candidatePo.replace(
      oldEntry,
      () =>
        `msgid ${JSON.stringify(entry.identifier)}\nmsgstr ${JSON.stringify(entry.translation)}`,
    );
  }
  validateCatalogs({ sourcePo, targetPo: candidatePo, glossary: { terms: [] } });
  return {
    candidatePo,
    receipt: {
      ...review,
      format: "crowdin-private-candidate-v1",
      status: "local-candidate-prepared",
      preservedMessages: 13,
      sourceHash: hash(sourcePo),
      baselineTargetHash: hash(baselineTargetPo),
      candidateHash: hash(candidatePo),
      evidenceHash: hash(JSON.stringify(evidence)),
      liveVerificationPerformed: false,
      atomicSnapshot: false,
      approvalTimeContentProved: false,
    },
  };
}

function blob(value) {
  return createHash("sha1")
    .update(`blob ${Buffer.byteLength(value)}\0`)
    .update(value)
    .digest("hex");
}

function normalizedTree(input) {
  const tree = z.parse(
    z
      .array(
        z.strictObject({
          path: z.string(),
          mode: z.enum(["100644", "100755", "120000", "160000"]),
          oid: z.string().check(z.regex(/^[a-f0-9]{40}$/u)),
        }),
      )
      .check(z.minLength(2)),
    input,
  );
  const paths = new Set(tree.map((entry) => entry.path));
  if (paths.size !== tree.length) throw new Error("Duplicate Git tree paths");
  for (const path of paths) {
    const parts = path.split("/");
    if (
      ["\r", "\n", "\0", "\\"].some((character) => path.includes(character)) ||
      parts.some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error("Invalid Git tree path");
    }
    while (parts.length > 1) {
      parts.pop();
      if (paths.has(parts.join("/"))) throw new Error("Conflicting Git tree paths");
    }
  }
  return tree.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function verifyPrivateCandidate(input) {
  const { repository, baseBranch, baseSha, currentBaseSha, mergeBase, headSha, candidatePo } =
    input;
  if (
    repository !== "aidanaden/jupiter-i18n-translation-pilot" ||
    baseBranch !== "aidan/crowdin-private-source-20260911"
  ) {
    throw new Error("Wrong repository or base branch");
  }
  if (
    baseSha !== "be101fae90c42554de45deb5393b19771aa1318f" ||
    currentBaseSha !== baseSha ||
    mergeBase !== baseSha ||
    !z.safeParse(z.string().check(z.regex(/^[a-f0-9]{40}$/u)), headSha).success ||
    headSha === baseSha
  ) {
    throw new Error("Wrong or stale Git heads");
  }
  const result = preparePrivateCandidate(input);
  if (candidatePo !== result.candidatePo)
    throw new Error("Candidate differs from exact reviewed replacement");
  const baseTree = normalizedTree(input.baseTree);
  const targetPath = "src/i18n/locales/zh-Hans/messages.po";
  for (const [path, text] of [
    ["src/i18n/locales/en/messages.po", input.sourcePo],
    [targetPath, input.baselineTargetPo],
  ]) {
    const entry = baseTree.find((item) => item.path === path);
    if (entry?.mode !== "100644" || entry.oid !== blob(text))
      throw new Error("Base tree catalog differs");
  }
  const expectedTree = baseTree.map((entry) =>
    entry.path === targetPath ? { ...entry, oid: blob(candidatePo) } : entry,
  );
  if (JSON.stringify(normalizedTree(input.candidateTree)) !== JSON.stringify(expectedTree)) {
    throw new Error("Candidate has unrelated tree changes");
  }
  return {
    ...result.receipt,
    status: "local-candidate-verified",
    repository,
    baseBranch,
    baseSha,
    headSha,
  };
}
