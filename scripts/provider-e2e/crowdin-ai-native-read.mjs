import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const nativeScope = Object.freeze({
  repository: "aidanaden/jupiter-i18n-translation-pilot",
  projectId: 927431,
  projectSlug: "crowdin-ai-recording-02",
  fileId: 14,
  sourceRevision: 1,
  languageId: "zh-CN",
});

const apiRoot = "https://api.crowdin.com/api/v2";
const projectPath = `/projects/${nativeScope.projectId}`;
const limit = 100;
const maxPages = 10;

class NativeReadError extends Error {}

function requireValue(condition, message) {
  if (!condition) throw new NativeReadError(message);
}

export function safeFailureMessage(error) {
  return error instanceof NativeReadError
    ? `Crowdin native read failed: ${error.message}`
    : "Crowdin native read failed: unexpected local or response error. No response details were recorded.";
}

function positiveId(value) {
  requireValue(Number.isSafeInteger(value) && value > 0, "Invalid native ID.");
  return value;
}

function stringValue(value) {
  requireValue(typeof value === "string", "Invalid native text.");
  return value;
}

function dateValue(value) {
  requireValue(
    typeof value === "string" && Number.isFinite(Date.parse(value)),
    "Invalid native date.",
  );
  return value;
}

function unbranched(value) {
  requireValue(value === null || value === 0, "Unexpected native branch or directory.");
  return null;
}

export function selectProject(data) {
  requireValue(
    data?.id === nativeScope.projectId &&
      data.identifier === nativeScope.projectSlug &&
      data.sourceLanguageId === "en" &&
      Array.isArray(data.targetLanguageIds) &&
      data.targetLanguageIds.length === 1 &&
      data.targetLanguageIds[0] === nativeScope.languageId &&
      data.visibility === "private",
    "Native project identity mismatch.",
  );
  return {
    id: data.id,
    identifier: data.identifier,
    sourceLanguageId: data.sourceLanguageId,
    targetLanguageIds: [...data.targetLanguageIds],
    visibility: data.visibility,
  };
}

export function selectFile(data) {
  requireValue(
    data?.id === nativeScope.fileId &&
      data.projectId === nativeScope.projectId &&
      data.name === "messages.po" &&
      data.revisionId === nativeScope.sourceRevision,
    "Native file identity or revision mismatch.",
  );
  return {
    id: data.id,
    projectId: data.projectId,
    name: data.name,
    revisionId: data.revisionId,
    branchId: unbranched(data.branchId),
    directoryId: unbranched(data.directoryId),
  };
}

export function selectString(data) {
  requireValue(
    data?.projectId === nativeScope.projectId && data.fileId === nativeScope.fileId,
    "Native string scope mismatch.",
  );
  return {
    id: positiveId(data.id),
    projectId: data.projectId,
    fileId: data.fileId,
    identifier: stringValue(data.identifier),
    text: stringValue(data.text),
    context: stringValue(data.context),
    revision: positiveId(data.revision),
    createdAt: dateValue(data.createdAt),
    updatedAt: dateValue(data.updatedAt),
  };
}

function selectTranslationValue(data) {
  return {
    translationId: positiveId(data.translationId),
    text: stringValue(data.text),
    userId: positiveId(data.user?.id),
    createdAt: dateValue(data.createdAt),
  };
}

export function selectTranslation(data) {
  const result = {
    stringId: positiveId(data?.stringId),
    contentType: stringValue(data.contentType),
  };
  if (Array.isArray(data.plurals)) {
    requireValue(
      data.plurals.length > 0 && data.plurals.length <= 6,
      "Invalid native plural count.",
    );
    const plurals = data.plurals.map((plural) => ({
      ...selectTranslationValue(plural),
      pluralForm: stringValue(plural.pluralForm),
    }));
    requireValue(
      new Set(plurals.map((plural) => plural.pluralForm)).size === plurals.length,
      "Duplicate plural form.",
    );
    return { ...result, plurals };
  }
  return { ...result, ...selectTranslationValue(data) };
}

export function selectApproval(data) {
  requireValue(data?.languageId === nativeScope.languageId, "Native approval language mismatch.");
  return {
    id: positiveId(data.id),
    translationId: positiveId(data.translationId),
    stringId: positiveId(data.stringId),
    languageId: data.languageId,
    userId: positiveId(data.user?.id),
    createdAt: dateValue(data.createdAt),
  };
}

export async function collectNativeSnapshot({
  token,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
}) {
  requireValue(
    typeof token === "string" && token.trim().length > 0 && !/[\r\n]/u.test(token),
    "Crowdin token is missing or invalid.",
  );
  const startedAt = dateValue(now());
  const requests = [];
  async function get(path) {
    let response;
    try {
      response = await fetchImpl(`${apiRoot}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new NativeReadError(
        `Crowdin read request failed at ${path}. No response details were recorded.`,
      );
    }
    requireValue(!response.redirected, "Crowdin redirect refused.");
    requireValue(
      response.ok,
      `Crowdin read request was rejected at ${path} (HTTP ${Number.isInteger(response.status) ? response.status : "unknown"}). Check access without logging credentials.`,
    );
    let body;
    try {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(chunk.value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new NativeReadError(`Crowdin response was not valid bounded JSON at ${path}.`);
    }
    requests.push({ path, receivedAt: dateValue(now()) });
    return body;
  }
  async function list(path, select, key) {
    const records = [];
    const seen = new Set();
    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * limit;
      const body = await get(`${path}&limit=${limit}&offset=${offset}`);
      requireValue(
        Array.isArray(body?.data) &&
          body.data.length <= limit &&
          body.pagination?.offset === offset &&
          body.pagination.limit === limit,
        "Native pagination mismatch.",
      );
      for (const wrapper of body.data) {
        const record = select(wrapper?.data);
        const id = key(record);
        requireValue(!seen.has(id), "Duplicate or stalled native page.");
        seen.add(id);
        records.push(record);
      }
      if (body.data.length < limit) return records;
    }
    throw new NativeReadError("Native pagination bound reached. Snapshot is incomplete.");
  }
  const project = selectProject((await get(projectPath)).data);
  const file = selectFile((await get(`${projectPath}/files/14`)).data);
  const strings = await list(`${projectPath}/strings?fileId=14`, selectString, (item) => item.id);
  requireValue(
    strings.length === 13 && new Set(strings.map((item) => item.identifier)).size === 13,
    "Expected exactly 13 distinct source strings.",
  );
  const translations = await list(
    `${projectPath}/languages/zh-CN/translations?fileId=14`,
    selectTranslation,
    (item) => item.stringId,
  );
  const approvals = await list(
    `${projectPath}/approvals?languageId=zh-CN&fileId=14`,
    selectApproval,
    (item) => item.id,
  );
  const sourceIds = new Set(strings.map((item) => item.id));
  requireValue(
    [...translations, ...approvals].every((item) => sourceIds.has(item.stringId)),
    "Native record refers to an unknown source string.",
  );
  const translationIds = translations.flatMap((item) =>
    (item.plurals ?? [item]).map((part) => part.translationId),
  );
  requireValue(
    new Set(translationIds).size === translationIds.length,
    "Duplicate native translation ID.",
  );
  selectFile((await get(`${projectPath}/files/14`)).data);
  return {
    format: "crowdin-native-read-snapshot-v1",
    scope: nativeScope,
    startedAt,
    completedAt: dateValue(now()),
    atomicSnapshot: false,
    approvalTimeContentProved: false,
    humanApprovalProved: false,
    deliveryAuthorized: false,
    project,
    file,
    strings,
    translations,
    approvals,
    requests,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireValue(
      process.argv.length === 3,
      "Usage: crowdin-ai-native-read.mjs NEW_OUTPUT_DIRECTORY",
    );
    requireValue(
      process.env.GITHUB_REPOSITORY === nativeScope.repository,
      "Unexpected repository.",
    );
    const snapshot = await collectNativeSnapshot({ token: process.env.CROWDIN_PERSONAL_TOKEN });
    const output = resolve(process.argv[2]);
    await mkdir(output, { mode: 0o700 });
    await writeFile(`${output}/snapshot.json`, `${JSON.stringify(snapshot, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    const summary = `Crowdin native read complete. Sources: ${snapshot.strings.length}. Translation records: ${snapshot.translations.length}. Approval records: ${snapshot.approvals.length}. No changes made. Not proof of human review or approval-time content.\n`;
    await writeFile(`${output}/summary.txt`, summary, { flag: "wx", mode: 0o600 });
    process.stdout.write(summary);
  } catch (error) {
    process.stderr.write(
      `${safeFailureMessage(error)} No complete evidence artifact was produced.\n`,
    );
    process.exitCode = 1;
  }
}
