import { createHash } from "node:crypto";

import { formatter } from "@lingui/format-po";
import * as z from "zod/v4-mini";

import { selectProject } from "./crowdin-ai-native-read.mjs";
import { validateCatalogs } from "./offline-runner.mjs";

export const incrementalScope = Object.freeze({
  repository: "aidanaden/jupiter-i18n-translation-pilot",
  baseBranch: "aidan/provider-e2e-crowdin-ai-base",
  integrationBranch: "aidan.provider-e2e-crowdin-ai-base",
  projectId: 927431,
  fileId: 26,
  fileRevision: 2,
  messageId: "pilot.recording.proof",
  sourceHash: "3fdbd7cf75b9559b734db4cce7a26c445021425b66ed9f199d6100dd0b915fce",
  acceptedTargetHash: "b8d4954fefe2800a96f6406044512cd6ca3d6c1c16179b35ad9d3879c0c7ba81",
  reviewerId: 17853021,
  reviewedText: "源文本更新后，AI 翻译会自动开始",
  reviewerDisclosure: "Automated test reviewer. No human language review.",
});
const sourcePath = "src/i18n/locales/en/messages.po";
const targetPath = "src/i18n/locales/zh-Hans/messages.po";
const shaPattern = /^[a-f0-9]{40}$/u;
const po = formatter({ explicitIdAsDefault: true });

export class NativeSourceMismatchError extends Error {
  constructor(entry, expectedText) {
    super("Native source changed");
    this.facts = {
      id: Number.isSafeInteger(entry.id) ? entry.id : null,
      revision: Number.isSafeInteger(entry.revision) ? entry.revision : null,
      projectMatches: entry.projectId === incrementalScope.projectId,
      fileMatches: entry.fileId === incrementalScope.fileId,
      textMatches: entry.text === expectedText,
    };
  }
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(value) {
  return createHash("sha256").update(z.parse(z.string(), value)).digest("hex");
}

function blob(value) {
  return createHash("sha1")
    .update(`blob ${Buffer.byteLength(value)}\0`)
    .update(value)
    .digest("hex");
}

function positiveId(value) {
  requireValue(Number.isSafeInteger(value) && value > 0, "Invalid native ID");
  return value;
}

function time(value) {
  return Date.parse(z.parse(z.iso.datetime({ offset: true }), value));
}

function unique(records, key) {
  requireValue(
    Array.isArray(records) && new Set(records.map((record) => record[key])).size === records.length,
    `Duplicate or missing ${key} records`,
  );
}

function validateNativeState(state, source, end) {
  state = z.parse(z.record(z.string(), z.unknown()), state);
  selectProject(state.project);
  const file = state.file;
  requireValue(
    file?.id === incrementalScope.fileId &&
      file.projectId === incrementalScope.projectId &&
      file.name === "messages.po" &&
      file.revisionId === incrementalScope.fileRevision,
    "Wrong native file or revision",
  );
  const branchId = positiveId(file.branchId);
  requireValue(
    state.branch?.id === branchId && state.branch.name === incrementalScope.integrationBranch,
    "Wrong integration branch",
  );
  requireValue(
    Array.isArray(state.directories) && state.directories.length === 4,
    "Wrong directory depth",
  );
  let directoryId = positiveId(file.directoryId);
  for (const [index, name] of ["en", "locales", "i18n", "src"].entries()) {
    const directory = state.directories[index];
    requireValue(
      directory?.id === directoryId && directory.name === name && directory.branchId === branchId,
      "Wrong directory chain",
    );
    directoryId = directory.directoryId;
  }
  requireValue(directoryId === null || directoryId === 0, "Unexpected parent directory");
  unique(state.strings, "id");
  unique(state.strings, "identifier");
  requireValue(
    state.strings.length === 13 &&
      JSON.stringify(state.strings.map((entry) => entry.identifier).sort()) ===
        JSON.stringify(Object.keys(source).sort()),
    "Native source identifiers differ",
  );
  for (const entry of state.strings) {
    positiveId(entry.id);
    if (
      entry.projectId !== incrementalScope.projectId ||
      entry.fileId !== incrementalScope.fileId ||
      entry.text !== source[entry.identifier]?.translation ||
      entry.revision !== incrementalScope.fileRevision
    )
      throw new NativeSourceMismatchError(entry, source[entry.identifier]?.translation);
    const created = time(entry.createdAt);
    requireValue(
      created <= end &&
        (entry.updatedAt === null ||
          (time(entry.updatedAt) >= created && time(entry.updatedAt) <= end)),
      "Invalid native source time",
    );
  }
  const changed = state.strings.find((entry) => entry.identifier === incrementalScope.messageId);
  unique(state.translations, "stringId");
  unique(state.translations, "translationId");
  unique(state.approvals, "id");
  const ids = new Set(state.strings.map((entry) => entry.id));
  requireValue(
    [...state.translations, ...state.approvals].every((entry) => ids.has(entry.stringId)),
    "Unknown translation source",
  );
  const translations = state.translations.filter((entry) => entry.stringId === changed.id);
  const approvals = state.approvals.filter((entry) => entry.stringId === changed.id);
  requireValue(
    translations.length === 1 && approvals.length === 1,
    "One current translation and approval are required",
  );
  const translation = translations[0];
  const approval = approvals[0];
  positiveId(translation.translationId);
  positiveId(approval.id);
  requireValue(
    translation.contentType === "text/plain" &&
      !translation.plurals &&
      translation.text === incrementalScope.reviewedText &&
      translation.userId === incrementalScope.reviewerId,
    "Corrected translation differs from test review",
  );
  requireValue(
    approval.translationId === translation.translationId &&
      approval.languageId === "zh-CN" &&
      approval.userId === incrementalScope.reviewerId,
    "Approval does not match corrected translation and reviewer",
  );
  const sourceTime = Math.max(
    time(changed.createdAt),
    changed.updatedAt === null ? 0 : time(changed.updatedAt),
  );
  requireValue(
    sourceTime >= time("2026-09-09T21:00:00Z") &&
      time(translation.createdAt) >= sourceTime &&
      time(translation.createdAt) >= time("2026-09-09T21:32:00Z") &&
      time(approval.createdAt) >= time(translation.createdAt) &&
      time(approval.createdAt) >= time("2026-09-09T21:33:00Z") &&
      time(approval.createdAt) <= end,
    "Approval or correction predates source, or is in the future",
  );
  return {
    stringId: changed.id,
    translationId: translation.translationId,
    approvalId: approval.id,
    approvedAt: approval.createdAt,
  };
}

export function prepareIncrementalDelivery({ sourcePo, baselineTargetPo, snapshot, now }) {
  requireValue(hash(sourcePo) === incrementalScope.sourceHash, "Source hash differs");
  requireValue(
    hash(baselineTargetPo) === incrementalScope.acceptedTargetHash,
    "Accepted target hash differs",
  );
  requireValue(snapshot?.format === "crowdin-incremental-read-v1", "Wrong native evidence format");
  const start = time(snapshot.startedAt);
  const end = time(snapshot.completedAt);
  const current = time(now);
  requireValue(
    start <= end && end - start <= 300000 && current >= end && current - start <= 300000,
    "Native evidence is stale or has invalid time order",
  );
  requireValue(
    JSON.stringify(snapshot.first) === JSON.stringify(snapshot.second),
    "Native state changed between reads",
  );
  const source = po.parse(sourcePo);
  const approval = validateNativeState(snapshot.first, source, end);
  const oldEntry = 'msgid "pilot.recording.proof"\nmsgstr "翻译排练完成"';
  requireValue(baselineTargetPo.split(oldEntry).length === 2, "Pinned target entry is ambiguous");
  const candidatePo = baselineTargetPo.replace(
    oldEntry,
    `msgid "pilot.recording.proof"\nmsgstr ${JSON.stringify(incrementalScope.reviewedText)}`,
  );
  validateCatalogs({ sourcePo, targetPo: candidatePo, glossary: { terms: [] } });
  return {
    candidatePo,
    receipt: {
      format: "crowdin-incremental-preparation-v1",
      projectId: incrementalScope.projectId,
      fileId: incrementalScope.fileId,
      sourceRevision: incrementalScope.fileRevision,
      messageId: incrementalScope.messageId,
      sourceHash: incrementalScope.sourceHash,
      acceptedTargetHash: incrementalScope.acceptedTargetHash,
      candidateHash: hash(candidatePo),
      snapshotHash: hash(JSON.stringify(snapshot)),
      nativeCompletedAt: snapshot.completedAt,
      checkedAt: now,
      ...approval,
      preservedMessages: 12,
      reviewerDisclosure: incrementalScope.reviewerDisclosure,
      atomicSnapshot: false,
      approvalTimeContentProved: false,
      humanApprovalProved: false,
      deliveryAllowed: false,
      mergeAllowed: false,
      deploymentAllowed: false,
    },
  };
}

function normalizedTree(tree) {
  tree = z.parse(
    z
      .array(
        z.strictObject({
          path: z.string(),
          mode: z.enum(["100644", "100755", "120000", "160000"]),
          oid: z.string().check(z.regex(shaPattern)),
        }),
      )
      .check(z.minLength(2)),
    tree,
  );
  unique(tree, "path");
  requireValue(
    tree.every(
      (entry) =>
        !["\r", "\n", "\0", "\\"].some((character) => entry.path.includes(character)) &&
        entry.path.split("/").every((part) => part && part !== "." && part !== ".."),
    ),
    "Invalid Git tree",
  );
  const paths = new Set(tree.map((entry) => entry.path));
  for (const path of paths) {
    const parts = path.split("/");
    while (parts.length > 1) {
      parts.pop();
      requireValue(!paths.has(parts.join("/")), "Conflicting Git tree paths");
    }
  }
  return tree
    .map(({ path, mode, oid }) => ({ path, mode, oid }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function verifyIncrementalCandidate(input) {
  const { repository, baseBranch, baseSha, currentBaseSha, mergeBase, headSha, candidatePo } =
    input;
  requireValue(
    repository === incrementalScope.repository && baseBranch === incrementalScope.baseBranch,
    "Wrong repository or base branch",
  );
  requireValue(
    shaPattern.test(baseSha) &&
      shaPattern.test(headSha) &&
      headSha !== baseSha &&
      currentBaseSha === baseSha &&
      mergeBase === baseSha,
    "Wrong or stale Git heads",
  );
  const result = prepareIncrementalDelivery(input);
  requireValue(
    candidatePo === result.candidatePo,
    "Candidate differs from exact reviewed replacement",
  );
  const baseTree = normalizedTree(input.baseTree);
  for (const [path, text] of [
    [sourcePath, input.sourcePo],
    [targetPath, input.baselineTargetPo],
  ]) {
    const entry = baseTree.find((item) => item.path === path);
    requireValue(entry?.mode === "100644" && entry.oid === blob(text), "Base tree catalog differs");
  }
  const expectedTree = baseTree.map((entry) =>
    entry.path === targetPath ? { ...entry, oid: blob(candidatePo) } : entry,
  );
  requireValue(
    JSON.stringify(normalizedTree(input.candidateTree)) === JSON.stringify(expectedTree),
    "Candidate has unrelated tree changes",
  );
  return {
    ...result.receipt,
    status: "candidate-verified",
    repository,
    baseBranch,
    baseSha,
    headSha,
  };
}
