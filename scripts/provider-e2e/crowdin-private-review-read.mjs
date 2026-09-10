import * as z from "zod/v4-mini";

import { checkPrivateReview } from "./crowdin-private-review-check.mjs";

const id = z.number().check(z.int(), z.positive(), z.maximum(Number.MAX_SAFE_INTEGER));
const timestamp = z.iso.datetime({ offset: true });
const sourceSchema = z.object({
  id,
  projectId: z.literal(929237),
  fileId: z.literal(24),
  identifier: z.string(),
  text: z.string(),
  createdAt: timestamp,
  updatedAt: z.nullable(timestamp),
});
const translationValue = {
  translationId: id,
  text: z.string(),
  user: z.object({ id }),
  createdAt: timestamp,
};
const translationSchema = z.union([
  z.object({ stringId: id, contentType: z.string(), ...translationValue }),
  z.object({
    stringId: id,
    contentType: z.string(),
    plurals: z
      .array(z.object({ ...translationValue, pluralForm: z.string() }))
      .check(z.minLength(1), z.maxLength(6)),
  }),
]);
const approvalSchema = z.object({
  id,
  stringId: id,
  translationId: id,
  user: z.object({ id }),
  languageId: z.literal("zh-CN"),
  createdAt: timestamp,
});
const identifiers = ["balance", "limit", "market", "pay", "receive", "recurring"].map(
  (key) => `swap.form.${key}`,
);
const projectPath = "/projects/929237";

export async function collectPrivateReviewSnapshot({
  token,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
}) {
  z.parse(
    z.string().check(
      z.minLength(1),
      z.refine((value) => Boolean(value.trim()) && !/[\r\n]/u.test(value)),
    ),
    token,
  );
  const startedAt = z.parse(timestamp, now());
  async function get(path) {
    const controller = new AbortController();
    let timer;
    let reader;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Native read failed"));
      }, 15000);
    });
    try {
      return await Promise.race([
        deadline,
        (async () => {
          const response = await fetchImpl(`https://api.crowdin.com/api/v2${projectPath}${path}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            redirect: "error",
            signal: controller.signal,
          });
          if (!response.ok || response.redirected) throw new Error("Native read refused");
          reader = response.body.getReader();
          const chunks = [];
          let size = 0;
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > 1000000) {
              await reader.cancel();
              throw new Error("Native response exceeds size bound");
            }
            chunks.push(next.value);
          }
          return JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
          );
        })(),
      ]);
    } catch {
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      throw new Error("Native read failed. No response details were recorded.");
    } finally {
      clearTimeout(timer);
    }
  }
  async function list(path, schema, key) {
    const records = [];
    const seen = new Set();
    for (let page = 0; page < 5; page += 1) {
      const offset = page * 100;
      const body = z.parse(
        z.object({
          data: z.array(z.object({ data: schema })).check(z.maxLength(100)),
          pagination: z.object({ offset: z.literal(offset), limit: z.literal(100) }),
        }),
        await get(`${path}&limit=100&offset=${offset}`),
      );
      for (const { data } of body.data) {
        if (seen.has(data[key])) throw new Error("Duplicate native record");
        seen.add(data[key]);
        records.push(data);
      }
      if (body.data.length < 100) return records.sort((a, b) => a[key] - b[key]);
    }
    throw new Error("Native pagination bound reached");
  }
  async function readState() {
    z.parse(
      z.object({
        id: z.literal(929237),
        identifier: z.literal("jupiter-ai-private-20260911"),
        visibility: z.literal("private"),
        sourceLanguageId: z.literal("en"),
        targetLanguageIds: z.tuple([z.literal("zh-CN")]),
      }),
      (await get("")).data,
    );
    const fileSchema = z.object({
      id: z.literal(24),
      projectId: z.literal(929237),
      name: z.literal("messages.po"),
      revisionId: id,
      branchId: id,
      directoryId: id,
    });
    const file = z.parse(fileSchema, (await get("/files/24")).data);
    const branch = z.parse(
      z.object({
        id: z.literal(file.branchId),
        name: z.literal("aidan.crowdin-private-source-20260911"),
      }),
      (await get(`/branches/${file.branchId}`)).data,
    );
    let directoryId = file.directoryId;
    for (const name of ["en", "locales", "i18n", "src"]) {
      const directory = z.parse(
        z.object({
          id: z.literal(z.parse(id, directoryId)),
          name: z.literal(name),
          branchId: z.literal(branch.id),
          directoryId: z.nullable(z.number().check(z.int(), z.nonnegative())),
        }),
        (await get(`/directories/${directoryId}`)).data,
      );
      directoryId = directory.directoryId;
    }
    if (directoryId !== null && directoryId !== 0) throw new Error("Unexpected parent directory");
    const sources = await list("/strings?fileId=24", sourceSchema, "id");
    if (sources.length !== 19 || new Set(sources.map((source) => source.identifier)).size !== 19)
      throw new Error("Expected 19 distinct sources");
    const translations = await list(
      "/languages/zh-CN/translations?fileId=24",
      translationSchema,
      "stringId",
    );
    const approvals = await list("/approvals?languageId=zh-CN&fileId=24", approvalSchema, "id");
    const sourceIds = new Set(sources.map((source) => source.id));
    if ([...translations, ...approvals].some((record) => !sourceIds.has(record.stringId)))
      throw new Error("Unknown source reference");
    const translationIds = translations.flatMap((translation) =>
      (translation.plurals ?? [translation]).map((value) => value.translationId),
    );
    if (new Set(translationIds).size !== translationIds.length)
      throw new Error("Duplicate translation ID");
    const entries = identifiers.map((identifier) => {
      const source = sources.find((value) => value.identifier === identifier);
      const translation = translations.find((value) => value.stringId === source?.id);
      const matching = approvals.filter(
        (value) =>
          value.stringId === source?.id &&
          value.translationId === translation?.translationId &&
          value.user.id === 17853021,
      );
      if (!source || !translation || translation.plurals || matching.length !== 1)
        throw new Error("Missing unique current review approval");
      const [approval] = matching;
      return {
        identifier,
        stringId: source.id,
        source: source.text,
        sourceUpdatedAt: source.updatedAt ?? source.createdAt,
        translationId: translation.translationId,
        translation: translation.text,
        translatedAt: translation.createdAt,
        approvalId: approval.id,
        approvedTranslationId: approval.translationId,
        reviewerId: approval.user.id,
        languageId: approval.languageId,
        approvedAt: approval.createdAt,
      };
    });
    const finalFile = z.parse(fileSchema, (await get("/files/24")).data);
    if (JSON.stringify(file) !== JSON.stringify(finalFile))
      throw new Error("Native file changed during read");
    return {
      projectId: 929237,
      fileId: 24,
      branchName: branch.name,
      revision: file.revisionId,
      entries,
    };
  }
  const first = await readState();
  const second = await readState();
  const evidence = { startedAt, completedAt: now(), now: now(), first, second };
  checkPrivateReview(evidence);
  return evidence;
}
