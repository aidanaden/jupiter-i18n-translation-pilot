import { createHash } from "node:crypto";

import { formatter } from "@lingui/format-po";
import * as z from "zod/v4-mini";

import { createAppSourcePacket } from "./app-catalog.mjs";
import { lingoJsonToPo } from "./lingo-json.mjs";
import { validateCatalogs } from "./offline-runner.mjs";

const sourcePath = "src/i18n/locales/en/messages.po";
const targetPath = "src/i18n/locales/zh-Hans/messages.po";
const sourceHash = "d04afe258a31159ff49d6f289142f0601fea4b5cf10bce21661eb008f945679e";
const text = z.string().check(z.minLength(1), z.regex(/\S/));
const oid = z.string().check(z.regex(/^[a-f0-9]{40}$/));
const hash = z.string().check(z.regex(/^[a-f0-9]{64}$/));
const id = z.number().check(z.int(), z.minimum(1));
const manifestSchema = z.strictObject({
  repository: z.literal("aidanaden/jupiter-i18n-translation-pilot"),
  baseBranch: z.literal("aidan/provider-e2e-crowdin-ai-base"),
  candidateBranch: z
    .string()
    .check(z.regex(/^aidan\/crowdin-ai-candidate-[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  baseHead: oid,
  baseTreeOid: oid,
  pinnedSourceHead: z.literal("96bbb4619507225bf663b44b221ded24b95f9777"),
  projectSlug: z.literal("crowdin-ai-recording-02"),
  projectId: id,
  branchId: z.nullable(id),
  fileId: id,
  sourceRevision: id,
  sourceHash: z.literal(sourceHash),
  providerLanguage: z.literal("zh-CN"),
  repositoryLanguage: z.literal("zh-Hans"),
  reviewerDisclosure: z.literal("Automated test reviewer. No human language review."),
});
const treeSchema = z
  .array(
    z.strictObject({
      path: text,
      mode: z.enum(["100644", "100755", "120000", "160000"]),
      oid,
    }),
  )
  .check(z.minLength(2));
const currentSchema = z.strictObject({
  head: oid,
  sourcePo: text,
  targetPo: text,
  tree: treeSchema,
});
const baselineSchema = z.strictObject({ manifest: manifestSchema, current: currentSchema });
const entrySchema = z.strictObject({
  messageId: text,
  stringId: id,
  sourceText: text,
  sourceRevision: id,
  translationId: id,
  translationHash: hash,
  translationText: text,
  approvalId: id,
  approvedTranslationId: id,
  approvedTranslationHash: hash,
  approvedSourceRevision: id,
  approvedText: text,
});
const evidenceSchema = z.strictObject({
  format: z.literal("normalized-review-snapshot-v1"),
  projectId: id,
  projectSlug: z.literal("crowdin-ai-recording-02"),
  branchId: z.nullable(id),
  fileId: id,
  sourceRevision: id,
  sourceHash: z.literal(sourceHash),
  providerLanguage: z.literal("zh-CN"),
  entries: z.array(entrySchema).check(z.length(13)),
});
const authority = {
  evidence: "data-integrity-only",
  liveStateProved: false,
  humanApprovalProved: false,
  providerRequestAllowed: false,
  deliveryAllowed: false,
  mergeAllowed: false,
  deploymentAllowed: false,
};
const po = formatter({ explicitIdAsDefault: true });

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function blob(value) {
  return createHash("sha1")
    .update(`blob ${Buffer.byteLength(value)}\0`)
    .update(value)
    .digest("hex");
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function seal(value) {
  const data = { ...value, ...authority };
  return freeze({ ...data, digest: digest(JSON.stringify(["crowdin-ai-cycle-v1", data])) });
}

function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} differs`);
}

function treeSnapshot(tree, sourcePo, targetPo) {
  const entries = z
    .parse(treeSchema, tree)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const paths = new Set();
  for (const entry of entries) {
    if (
      entry.path.split("/").some((part) => !part || part === "." || part === "..") ||
      ["\0", "\r", "\n", "\\"].some((character) => entry.path.includes(character)) ||
      paths.has(entry.path)
    )
      throw new Error("Invalid or duplicate tree path");
    paths.add(entry.path);
  }
  for (const path of paths) {
    const parts = path.split("/");
    while (parts.length > 1) {
      parts.pop();
      if (paths.has(parts.join("/"))) throw new Error("Tree file and directory conflict");
    }
  }
  for (const [path, value] of [
    [sourcePath, sourcePo],
    [targetPath, targetPo],
  ]) {
    const entry = entries.find((item) => item.path === path);
    if (!entry || entry.mode !== "100644" || entry.oid !== blob(value))
      throw new Error(`Tree blob differs: ${path}`);
  }
  return entries;
}

function gitTreeOid(entries) {
  const root = new Map();
  for (const entry of entries) {
    const parts = entry.path.split("/");
    const name = parts.pop();
    let parent = root;
    for (const part of parts) {
      if (!parent.has(part)) parent.set(part, new Map());
      parent = parent.get(part);
    }
    parent.set(name, entry);
  }
  function encode(children) {
    const records = [...children].map(([name, value]) =>
      value instanceof Map
        ? { name, mode: "40000", oid: encode(value), sortKey: `${name}/` }
        : { name, mode: value.mode, oid: value.oid, sortKey: name },
    );
    records.sort((a, b) => Buffer.compare(Buffer.from(a.sortKey), Buffer.from(b.sortKey)));
    const body = Buffer.concat(
      records.flatMap((entry) => [
        Buffer.from(`${entry.mode} ${entry.name}\0`),
        Buffer.from(entry.oid, "hex"),
      ]),
    );
    return createHash("sha1").update(`tree ${body.length}\0`).update(body).digest("hex");
  }
  return encode(root);
}

export function createCrowdinAiBaseline(input) {
  const { manifest, current } = z.parse(baselineSchema, input);
  if (manifest.projectId === 923331) throw new Error("Original Crowdin project is excluded");
  equal(current.head, manifest.baseHead, "Baseline head");
  equal(digest(current.sourcePo), sourceHash, "Pinned source");
  createAppSourcePacket({
    sourcePo: current.sourcePo,
    baselineTargetPo: current.targetPo,
    gitHead: current.head,
  });
  const tree = treeSnapshot(current.tree, current.sourcePo, current.targetPo);
  equal(gitTreeOid(tree), manifest.baseTreeOid, "Complete baseline Git tree");
  return seal({
    phase: "baseline",
    manifest,
    manifestDigest: digest(JSON.stringify(manifest)),
    current: { ...current, tree },
    hashes: {
      source: sourceHash,
      target: digest(current.targetPo),
      tree: digest(JSON.stringify(tree)),
      gitTree: manifest.baseTreeOid,
    },
  });
}

function verifyBaseline(baseline) {
  if (!baseline || typeof baseline !== "object") throw new Error("Missing baseline");
  const rebuilt = createCrowdinAiBaseline({
    manifest: baseline.manifest,
    current: baseline.current,
  });
  equal(baseline, rebuilt, "Baseline integrity");
  return rebuilt;
}

function verifyCurrent(baseline, current, expectedHead, targetPo) {
  const data = z.parse(currentSchema, current);
  equal(data.head, expectedHead, "Current head");
  equal(data.sourcePo, baseline.current.sourcePo, "Current source");
  equal(data.targetPo, targetPo, "Current target");
  const tree = treeSnapshot(data.tree, data.sourcePo, data.targetPo);
  const expectedTree = baseline.current.tree.map((entry) =>
    entry.path === targetPath ? { ...entry, oid: blob(targetPo) } : entry,
  );
  equal(tree, expectedTree, "Whole tree or unrelated paths");
  return { ...data, tree };
}

function verifyEvidence(baseline, evidence, exportedPo) {
  const data = z.parse(evidenceSchema, evidence);
  for (const key of [
    "projectId",
    "projectSlug",
    "branchId",
    "fileId",
    "sourceRevision",
    "sourceHash",
    "providerLanguage",
  ])
    equal(data[key], baseline.manifest[key], `Provider ${key}`);
  const source = po.parse(baseline.current.sourcePo);
  const exported = po.parse(exportedPo);
  if (!["zh-CN", "zh-Hans"].some((locale) => exportedPo.includes(`"Language: ${locale}\\n"`)))
    throw new Error("Wrong exported PO language");
  if (
    [...exportedPo.matchAll(/^msgid /gm)].length !== 14 ||
    Object.values(exported).some((entry) => entry.obsolete)
  )
    throw new Error("Duplicate or malformed export");
  equal(Object.keys(exported).sort(), Object.keys(source).sort(), "Export IDs");
  equal(
    data.entries.map((entry) => entry.messageId).sort(),
    Object.keys(source).sort(),
    "Evidence IDs",
  );
  for (const key of ["stringId", "translationId", "approvalId"])
    if (new Set(data.entries.map((entry) => entry[key])).size !== 13)
      throw new Error(`Duplicate ${key}`);
  for (const entry of data.entries) {
    equal(entry.sourceText, source[entry.messageId].translation, "Source text");
    equal(entry.sourceRevision, data.sourceRevision, "Source revision");
    equal(entry.approvedSourceRevision, data.sourceRevision, "Approved source revision");
    equal(entry.approvedTranslationId, entry.translationId, "Approved translation ID");
    equal(entry.translationHash, digest(entry.translationText), "Current translation content hash");
    equal(
      entry.approvedTranslationHash,
      digest(entry.approvedText),
      "Approval snapshot content hash",
    );
    equal(
      entry.approvedTranslationHash,
      entry.translationHash,
      "Approved translation content hash",
    );
    equal(entry.approvedText, entry.translationText, "Approved content");
    equal(
      exported[entry.messageId].translation,
      entry.translationText,
      "Exported approved content",
    );
  }
  const candidatePo = lingoJsonToPo(
    baseline.current.sourcePo,
    Object.fromEntries(data.entries.map((entry) => [entry.messageId, entry.translationText])),
    { expectedMessageCount: 13 },
  );
  validateCatalogs({
    sourcePo: baseline.current.sourcePo,
    targetPo: candidatePo,
    glossary: { terms: [] },
  });
  return { evidence: data, candidatePo };
}

export function stageCrowdinAiCandidate(input) {
  const data = z.parse(
    z.strictObject({
      baseline: z.unknown(),
      expectedManifestDigest: hash,
      current: currentSchema,
      evidence: evidenceSchema,
      exportedPo: text,
    }),
    input,
  );
  const baseline = verifyBaseline(data.baseline);
  equal(data.expectedManifestDigest, baseline.manifestDigest, "Expected target manifest");
  verifyCurrent(baseline, data.current, baseline.manifest.baseHead, baseline.current.targetPo);
  const { evidence, candidatePo } = verifyEvidence(baseline, data.evidence, data.exportedPo);
  if (candidatePo === baseline.current.targetPo) throw new Error("Candidate has no catalog change");
  return seal({
    phase: "fully-approved-candidate",
    baseline,
    reviewEvidence: evidence,
    exportedPo: data.exportedPo,
    candidatePo,
    candidateHash: digest(candidatePo),
  });
}

function verifyCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("Missing candidate");
  const baseline = verifyBaseline(candidate.baseline);
  const rebuilt = stageCrowdinAiCandidate({
    baseline,
    expectedManifestDigest: baseline.manifestDigest,
    current: baseline.current,
    evidence: candidate.reviewEvidence,
    exportedPo: candidate.exportedPo,
  });
  equal(candidate, rebuilt, "Candidate integrity");
  return rebuilt;
}

export function acceptCrowdinAiCandidate(input) {
  const data = z.parse(
    z.strictObject({
      candidate: z.unknown(),
      expectedManifestDigest: hash,
      expectedCandidateDigest: hash,
      acceptedHead: oid,
      current: currentSchema,
    }),
    input,
  );
  const candidate = verifyCandidate(data.candidate);
  equal(data.expectedManifestDigest, candidate.baseline.manifestDigest, "Expected target manifest");
  equal(data.expectedCandidateDigest, candidate.digest, "Expected candidate");
  if (data.acceptedHead === candidate.baseline.manifest.baseHead)
    throw new Error("Accepted head must differ from baseline");
  const current = verifyCurrent(
    candidate.baseline,
    data.current,
    data.acceptedHead,
    candidate.candidatePo,
  );
  return seal({
    phase: "accepted",
    candidate,
    current,
    acceptedTreeHash: digest(JSON.stringify(current.tree)),
    acceptedGitTreeOid: gitTreeOid(current.tree),
  });
}

function verifyAccepted(input, additionalShape = {}) {
  const data = z.parse(
    z.strictObject({
      accepted: z.unknown(),
      expectedManifestDigest: hash,
      expectedAcceptedDigest: hash,
      expectedAcceptedHead: oid,
      current: currentSchema,
      ...additionalShape,
    }),
    input,
  );
  const accepted = data.accepted;
  if (!accepted || typeof accepted !== "object") throw new Error("Missing accepted state");
  const candidate = verifyCandidate(accepted.candidate);
  const rebuilt = acceptCrowdinAiCandidate({
    candidate,
    expectedManifestDigest: data.expectedManifestDigest,
    expectedCandidateDigest: candidate.digest,
    acceptedHead: data.expectedAcceptedHead,
    current: accepted.current,
  });
  equal(accepted, rebuilt, "Accepted integrity");
  equal(data.expectedAcceptedDigest, rebuilt.digest, "Expected accepted state");
  verifyCurrent(candidate.baseline, data.current, data.expectedAcceptedHead, candidate.candidatePo);
  return { ...data, accepted: rebuilt };
}

export function planCrowdinAiRepeatExport(input) {
  const data = verifyAccepted(input, { evidence: evidenceSchema, exportedPo: text });
  const { candidatePo } = verifyEvidence(
    data.accepted.candidate.baseline,
    data.evidence,
    data.exportedPo,
  );
  equal(
    candidatePo,
    data.accepted.current.targetPo,
    "Accepted correction; changed export needs a new review cycle",
  );
  return seal({
    phase: "no-op",
    acceptedDigest: data.accepted.digest,
    targetHash: digest(candidatePo),
    changedPaths: [],
  });
}

export function planCrowdinAiReset(input) {
  const { accepted } = verifyAccepted(input);
  const baseline = accepted.candidate.baseline;
  return seal({
    phase: "reset-plan",
    acceptedDigest: accepted.digest,
    expectedHead: accepted.current.head,
    baselineTargetPo: baseline.current.targetPo,
    baselineTree: baseline.current.tree,
    baselineTreeHash: baseline.hashes.tree,
    changedPaths: [targetPath],
  });
}

export function verifyCrowdinAiReset(input) {
  const data = z.parse(
    z.strictObject({ before: z.unknown(), resetHead: oid, current: currentSchema }),
    input,
  );
  const verified = verifyAccepted(data.before);
  const baseline = verified.accepted.candidate.baseline;
  if ([baseline.manifest.baseHead, verified.accepted.current.head].includes(data.resetHead))
    throw new Error("Reset requires a new head");
  const current = verifyCurrent(baseline, data.current, data.resetHead, baseline.current.targetPo);
  equal(digest(JSON.stringify(current.tree)), baseline.hashes.tree, "Exact baseline tree");
  return seal({
    phase: "reset",
    acceptedDigest: verified.accepted.digest,
    current,
    baselineTreeHash: baseline.hashes.tree,
  });
}
