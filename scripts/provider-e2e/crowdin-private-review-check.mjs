import * as z from "zod/v4-mini";

const messages = {
  "swap.form.balance": "Balance {balance}",
  "swap.form.limit": "Limit",
  "swap.form.market": "Market",
  "swap.form.pay": "You pay",
  "swap.form.receive": "You receive",
  "swap.form.recurring": "Recurring",
};
const id = z.number().check(z.int(), z.positive());
const timestamp = z.iso.datetime({ offset: true });
const stateSchema = z.strictObject({
  projectId: z.literal(929237),
  fileId: z.literal(36),
  branchName: z.literal("aidan.crowdin-private-recording-base-20260911"),
  revision: id,
  entries: z
    .array(
      z.strictObject({
        identifier: z.string(),
        stringId: id,
        source: z.string(),
        sourceUpdatedAt: timestamp,
        translationId: id,
        translation: z.string().check(z.minLength(1)),
        translatedAt: timestamp,
        approvalId: id,
        approvedTranslationId: id,
        reviewerId: z.literal(17853021),
        languageId: z.literal("zh-CN"),
        approvedAt: timestamp,
      }),
    )
    .check(z.length(6)),
});

export function checkPrivateReview(input) {
  const evidence = z.parse(
    z.strictObject({
      startedAt: timestamp,
      completedAt: timestamp,
      now: timestamp,
      first: stateSchema,
      second: stateSchema,
    }),
    input,
  );
  const start = Date.parse(evidence.startedAt);
  const end = Date.parse(evidence.completedAt);
  const now = Date.parse(evidence.now);
  if (start > end || end > now || now - start > 300000) {
    throw new Error("Review evidence is stale or has invalid time order");
  }
  if (JSON.stringify(evidence.first) !== JSON.stringify(evidence.second)) {
    throw new Error("Review state changed between reads");
  }
  const entries = evidence.first.entries;
  for (const key of ["identifier", "stringId", "translationId", "approvalId"]) {
    if (new Set(entries.map((entry) => entry[key])).size !== 6) {
      throw new Error(`Duplicate review ${key}`);
    }
  }
  for (const entry of entries) {
    if (!Object.hasOwn(messages, entry.identifier) || entry.source !== messages[entry.identifier]) {
      throw new Error("Unexpected review source");
    }
    const placeholders = (text) => text.match(/\{[^{}]*\}/gu)?.sort() ?? [];
    if (
      JSON.stringify(placeholders(entry.source)) !== JSON.stringify(placeholders(entry.translation))
    ) {
      throw new Error("Translation placeholders differ");
    }
    if (
      !entry.translation.trim() ||
      entry.translation === entry.source ||
      entry.approvedTranslationId !== entry.translationId
    ) {
      throw new Error("Approval does not match translated text");
    }
    const sourceTime = Date.parse(entry.sourceUpdatedAt);
    const translated = Date.parse(entry.translatedAt);
    const approved = Date.parse(entry.approvedAt);
    if (sourceTime > translated || translated > approved || approved > start) {
      throw new Error("Review predates source or falls outside observation");
    }
  }
  return {
    status: "review-evidence-consistent",
    projectId: 929237,
    fileId: 36,
    reviewedMessages: 6,
    reviewerDisclosure: "Automated test reviewer. No human language review.",
    humanApprovalProved: false,
    deliveryAllowed: false,
    mergeAllowed: false,
    deploymentAllowed: false,
  };
}
