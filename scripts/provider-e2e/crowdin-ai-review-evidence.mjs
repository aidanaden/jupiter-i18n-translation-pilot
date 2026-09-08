import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatter } from "@lingui/format-po";
import * as z from "zod/v4-mini";

import { nativeScope } from "./crowdin-ai-native-read.mjs";

const sourceHash = "d04afe258a31159ff49d6f289142f0601fea4b5cf10bce21661eb008f945679e";
const disclosure = "Automated test reviewer. No human language review.";
const id = z.number().check(z.int(), z.minimum(1));
const text = z.string().check(z.minLength(1), z.regex(/\S/u));
const date = z.string().check(z.refine((value) => Number.isFinite(Date.parse(value))));
const sourceSchema = z.strictObject({
  id,
  projectId: z.literal(927431),
  fileId: z.literal(14),
  identifier: text,
  text,
  context: z.string(),
  revision: z.literal(1),
  createdAt: date,
  updatedAt: z.nullable(date),
});
const translationSchema = z.strictObject({
  stringId: id,
  contentType: text,
  translationId: id,
  text,
  userId: id,
  createdAt: date,
});
const approvalSchema = z.strictObject({
  id,
  translationId: id,
  stringId: id,
  languageId: z.literal("zh-CN"),
  userId: id,
  createdAt: date,
});
const snapshotSchema = z.strictObject({
  format: z.literal("crowdin-native-read-snapshot-v1"),
  scope: z.strictObject({
    repository: z.literal(nativeScope.repository),
    projectId: z.literal(927431),
    projectSlug: z.literal(nativeScope.projectSlug),
    fileId: z.literal(14),
    sourceRevision: z.literal(1),
    languageId: z.literal("zh-CN"),
  }),
  startedAt: date,
  completedAt: date,
  atomicSnapshot: z.literal(false),
  approvalTimeContentProved: z.literal(false),
  humanApprovalProved: z.literal(false),
  deliveryAuthorized: z.literal(false),
  project: z.strictObject({
    id: z.literal(927431),
    identifier: z.literal(nativeScope.projectSlug),
    sourceLanguageId: z.literal("en"),
    targetLanguageIds: z.tuple([z.literal("zh-CN")]),
    visibility: z.literal("private"),
  }),
  file: z.strictObject({
    id: z.literal(14),
    projectId: z.literal(927431),
    name: z.literal("messages.po"),
    revisionId: z.literal(1),
    branchId: z.null(),
    directoryId: z.null(),
  }),
  strings: z.array(sourceSchema).check(z.length(13)),
  translations: z.array(translationSchema).check(z.length(13)),
  approvals: z.array(approvalSchema).check(z.maxLength(13)),
  requests: z.array(z.strictObject({ path: text, receivedAt: date })).check(z.minLength(1)),
});

class ReviewEvidenceError extends Error {}

function requireValue(condition, message) {
  if (!condition) throw new ReviewEvidenceError(message);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function equal(actual, expected, label) {
  requireValue(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch.`);
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

function parse(schema, value, label) {
  const result = z.safeParse(schema, value);
  requireValue(result.success, `${label} schema mismatch.`);
  return result.data;
}

function unique(values, label) {
  requireValue(new Set(values).size === values.length, `Duplicate ${label}.`);
}

function validateSnapshot(value, sourcePo) {
  requireValue(
    typeof sourcePo === "string" && digest(sourcePo) === sourceHash,
    "Pinned source hash mismatch.",
  );
  const snapshot = parse(snapshotSchema, value, "Native snapshot; plural records are unsupported");
  const start = Date.parse(snapshot.startedAt);
  const end = Date.parse(snapshot.completedAt);
  requireValue(start <= end, "Native collection time order mismatch.");
  for (const request of snapshot.requests) {
    requireValue(
      request.path.startsWith("/projects/927431") && !/[\r\n]/u.test(request.path),
      "Native request scope mismatch.",
    );
    requireValue(
      Date.parse(request.receivedAt) >= start && Date.parse(request.receivedAt) <= end,
      "Native request time mismatch.",
    );
  }
  const source = formatter({ explicitIdAsDefault: true }).parse(sourcePo);
  unique(
    snapshot.strings.map((item) => item.id),
    "source ID",
  );
  unique(
    snapshot.strings.map((item) => item.identifier),
    "source identifier",
  );
  unique(
    snapshot.translations.map((item) => item.stringId),
    "translation source reference",
  );
  unique(
    snapshot.translations.map((item) => item.translationId),
    "translation ID",
  );
  unique(
    snapshot.approvals.map((item) => item.id),
    "approval ID",
  );
  unique(
    snapshot.approvals.map((item) => item.stringId),
    "approved source reference",
  );
  equal(
    snapshot.strings.map((item) => item.identifier).sort(),
    Object.keys(source).sort(),
    "Native source identifiers",
  );
  equal(
    snapshot.translations.map((item) => item.stringId).sort((a, b) => a - b),
    snapshot.strings.map((item) => item.id).sort((a, b) => a - b),
    "Translation source references",
  );
  for (const item of snapshot.strings) {
    equal(item.text, source[item.identifier].translation, "Native source text");
    requireValue(
      Date.parse(item.createdAt) <= end &&
        (item.updatedAt === null || Date.parse(item.updatedAt) <= end),
      "Native source date is after collection.",
    );
  }
  for (const item of snapshot.translations)
    requireValue(Date.parse(item.createdAt) <= end, "Native translation date is after collection.");
  snapshot.strings.sort((a, b) => a.id - b.id);
  snapshot.translations.sort((a, b) => a.stringId - b.stringId);
  snapshot.approvals.sort((a, b) => a.stringId - b.stringId);
  const entries = snapshot.strings.map((item, index) => ({
    messageId: item.identifier,
    stringId: item.id,
    sourceText: item.text,
    sourceRevision: item.revision,
    translationId: snapshot.translations[index].translationId,
    translationHash: digest(snapshot.translations[index].text),
    translationText: snapshot.translations[index].text,
  }));
  return { snapshot, entries };
}

export function captureCrowdinAiReview(input) {
  requireValue(input && typeof input === "object", "Missing pre-review input.");
  const { nativeSnapshot, sourcePo, reviewerUserId, capturedAt, reviewerDisclosure } = input;
  equal(reviewerDisclosure, disclosure, "Automated reviewer disclosure");
  parse(id, reviewerUserId, "Reviewer ID");
  parse(date, capturedAt, "Capture time");
  const { snapshot, entries } = validateSnapshot(nativeSnapshot, sourcePo);
  requireValue(snapshot.approvals.length === 0, "Pre-review snapshot already contains approvals.");
  const age = Date.parse(capturedAt) - Date.parse(snapshot.completedAt);
  requireValue(
    age >= 0 && age <= 5 * 60 * 1000,
    "Pre-review capture must follow collection within five minutes.",
  );
  const packet = {
    format: "crowdin-pre-review-capture-v1",
    capturedAt,
    reviewerUserId,
    reviewerDisclosure,
    sourceHash,
    preReviewSnapshot: snapshot,
    entries,
    atomicSnapshot: false,
    approvalTimeContentProved: false,
    humanApprovalProved: false,
    liveStateProved: false,
    deliveryAllowed: false,
  };
  return freeze({ ...packet, digest: digest(JSON.stringify(packet)) });
}

export function finalizeCrowdinAiReview(input) {
  requireValue(
    input && typeof input === "object" && input.capture && typeof input.capture === "object",
    "A saved pre-review capture is required.",
  );
  const { capture, expectedCaptureDigest, nativeSnapshot, sourcePo } = input;
  requireValue(
    typeof expectedCaptureDigest === "string" && /^[a-f0-9]{64}$/u.test(expectedCaptureDigest),
    "Saved capture digest is required.",
  );
  const rebuilt = captureCrowdinAiReview({
    nativeSnapshot: capture.preReviewSnapshot,
    sourcePo,
    reviewerUserId: capture.reviewerUserId,
    capturedAt: capture.capturedAt,
    reviewerDisclosure: capture.reviewerDisclosure,
  });
  equal(capture, rebuilt, "Saved capture integrity");
  equal(capture.digest, expectedCaptureDigest, "Externally saved capture digest");
  const { snapshot, entries } = validateSnapshot(nativeSnapshot, sourcePo);
  requireValue(
    Date.parse(snapshot.startedAt) > Date.parse(capture.capturedAt),
    "Post-review collection must follow capture.",
  );
  equal(snapshot.strings, capture.preReviewSnapshot.strings, "Source identity across review");
  equal(
    snapshot.translations,
    capture.preReviewSnapshot.translations,
    "Translation identity across review",
  );
  equal(entries, capture.entries, "Captured review content");
  requireValue(snapshot.approvals.length === 13, "Exactly thirteen native approvals are required.");
  const approvedEntries = entries.map((entry, index) => {
    const approval = snapshot.approvals[index];
    equal(approval.stringId, entry.stringId, "Approval source ID");
    equal(approval.translationId, entry.translationId, "Approval translation ID");
    equal(approval.userId, capture.reviewerUserId, "Automated reviewer ID");
    requireValue(
      Date.parse(approval.createdAt) >= Date.parse(capture.capturedAt) &&
        Date.parse(approval.createdAt) <= Date.parse(snapshot.completedAt),
      "Approval date is outside the captured review interval.",
    );
    const before = capture.entries[index];
    return {
      ...entry,
      approvalId: approval.id,
      approvedTranslationId: before.translationId,
      approvedTranslationHash: before.translationHash,
      approvedSourceRevision: before.sourceRevision,
      approvedText: before.translationText,
    };
  });
  return freeze({
    evidence: {
      format: "normalized-review-snapshot-v1",
      projectId: 927431,
      projectSlug: nativeScope.projectSlug,
      branchId: null,
      fileId: 14,
      sourceRevision: 1,
      sourceHash,
      providerLanguage: "zh-CN",
      entries: approvedEntries,
    },
    receipt: {
      format: "crowdin-review-join-receipt-v1",
      captureDigest: capture.digest,
      afterSnapshotHash: digest(JSON.stringify(snapshot)),
      capturedAt: capture.capturedAt,
      collectedAt: snapshot.completedAt,
      reviewerUserId: capture.reviewerUserId,
      reviewerDisclosure: disclosure,
      approvals: snapshot.approvals,
      contentBasis:
        "Saved pre-review native text, unchanged native IDs and text after review, and new native approval records. Timestamps do not prove unchanged content throughout the interval.",
      atomicSnapshot: false,
      approvalTimeContentProved: false,
      humanApprovalProved: false,
      liveStateProved: false,
      deliveryAllowed: false,
      mergeAllowed: false,
      deploymentAllowed: false,
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, inputPath] = process.argv.slice(2);
    requireValue(
      process.argv.length === 4 && ["capture", "finalize"].includes(command),
      "Usage: crowdin-ai-review-evidence.mjs capture|finalize INPUT_JSON",
    );
    const input = JSON.parse(await readFile(inputPath, "utf8"));
    const output =
      command === "capture" ? captureCrowdinAiReview(input) : finalizeCrowdinAiReview(input);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof ReviewEvidenceError ? error.message : "Review evidence failed. No input or response details were recorded."}\n`,
    );
    process.exitCode = 1;
  }
}
