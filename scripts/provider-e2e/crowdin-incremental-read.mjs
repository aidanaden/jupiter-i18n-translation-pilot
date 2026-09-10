import * as z from "zod/v4-mini";

import { selectApproval, selectProject, selectTranslation } from "./crowdin-ai-native-read.mjs";
import { incrementalScope } from "./crowdin-incremental-delivery.mjs";

const projectPath = `/projects/${incrementalScope.projectId}`;

function nativeId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid native ID");
  return value;
}

export async function collectIncrementalSnapshot({
  token,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
}) {
  token = z.parse(
    z.string().check(
      z.minLength(1),
      z.refine((value) => Boolean(value.trim()) && !/[\r\n]/u.test(value)),
    ),
    token,
  );
  const startedAt = now();
  async function get(path) {
    const response = await fetchImpl(`https://api.crowdin.com/api/v2${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || response.redirected) throw new Error("Native read refused");
    const reader = response.body.getReader();
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
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  }
  async function list(path, select, key) {
    const records = [];
    const seen = new Set();
    for (let page = 0; page < 5; page += 1) {
      const offset = page * 100;
      const body = await get(`${projectPath}${path}&limit=100&offset=${offset}`);
      if (
        !Array.isArray(body.data) ||
        body.data.length > 100 ||
        body.pagination?.offset !== offset ||
        body.pagination.limit !== 100
      )
        throw new Error("Invalid native pagination");
      for (const item of body.data) {
        const record = select(item.data);
        const id = nativeId(record[key]);
        if (seen.has(id)) throw new Error("Duplicate native record");
        seen.add(id);
        records.push(record);
      }
      if (body.data.length < 100) return records.sort((a, b) => a[key] - b[key]);
    }
    throw new Error("Native pagination bound reached");
  }
  async function readState() {
    const project = selectProject((await get(projectPath)).data);
    const rawFile = (await get(`${projectPath}/files/${incrementalScope.fileId}`)).data;
    if (
      rawFile?.id !== incrementalScope.fileId ||
      rawFile.projectId !== incrementalScope.projectId ||
      rawFile.name !== "messages.po"
    )
      throw new Error("Wrong native file");
    const file = {
      id: rawFile.id,
      projectId: rawFile.projectId,
      name: rawFile.name,
      revisionId: nativeId(rawFile.revisionId),
      branchId: nativeId(rawFile.branchId),
      directoryId: nativeId(rawFile.directoryId),
    };
    const rawBranch = (await get(`${projectPath}/branches/${file.branchId}`)).data;
    if (rawBranch?.id !== file.branchId || rawBranch.name !== incrementalScope.integrationBranch)
      throw new Error("Wrong integration branch");
    const branch = { id: rawBranch.id, name: rawBranch.name };
    const directories = [];
    let directoryId = file.directoryId;
    for (const name of ["en", "locales", "i18n", "src"]) {
      const raw = (await get(`${projectPath}/directories/${nativeId(directoryId)}`)).data;
      if (raw?.id !== directoryId || raw.name !== name || raw.branchId !== branch.id)
        throw new Error("Wrong directory chain");
      directories.push({
        id: raw.id,
        name: raw.name,
        directoryId: raw.directoryId,
        branchId: raw.branchId,
      });
      directoryId = raw.directoryId;
    }
    if (directoryId !== null && directoryId !== 0) throw new Error("Unexpected parent directory");
    const strings = await list(
      `/strings?fileId=${incrementalScope.fileId}`,
      (raw) => {
        if (raw?.projectId !== incrementalScope.projectId || raw.fileId !== incrementalScope.fileId)
          throw new Error("Wrong source scope");
        return {
          id: raw.id,
          projectId: raw.projectId,
          fileId: raw.fileId,
          identifier: raw.identifier,
          text: raw.text,
          revision: raw.revision,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        };
      },
      "id",
    );
    const translations = await list(
      `/languages/zh-CN/translations?fileId=${incrementalScope.fileId}`,
      selectTranslation,
      "stringId",
    );
    const approvals = await list(
      `/approvals?languageId=zh-CN&fileId=${incrementalScope.fileId}`,
      selectApproval,
      "id",
    );
    return { project, file, branch, directories, strings, translations, approvals };
  }
  const first = await readState();
  const second = await readState();
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw new Error("Native state changed between reads");
  return { format: "crowdin-incremental-read-v1", startedAt, completedAt: now(), first, second };
}
