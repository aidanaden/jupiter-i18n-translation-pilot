import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  collectNativeSnapshot,
  nativeScope,
  safeFailureMessage,
  selectApproval,
  selectFile,
  selectProject,
  selectString,
  selectTranslation,
} from "./crowdin-ai-native-read.mjs";

const date = "2026-09-09T00:00:00Z";
const project = {
  id: 927431,
  identifier: "crowdin-ai-recording-02",
  sourceLanguageId: "en",
  targetLanguageIds: ["zh-CN"],
  visibility: "private",
  owner: { email: "private@example.test" },
};
const file = {
  id: 14,
  projectId: 927431,
  name: "messages.po",
  revisionId: 1,
  branchId: null,
  directoryId: null,
};
const source = (id) => ({
  id,
  projectId: 927431,
  fileId: 14,
  identifier: `key${id}`,
  text: `Source ${id}`,
  context: "Test context",
  revision: 1,
  createdAt: date,
  updatedAt: date,
});
const translation = (id = 1) => ({
  stringId: id,
  contentType: "text/plain",
  translationId: id + 100,
  text: "测试",
  user: { id: 42, email: "private@example.test", fullName: "Private Name" },
  createdAt: date,
});
const approval = {
  id: 51,
  translationId: 101,
  stringId: 1,
  languageId: "zh-CN",
  user: { id: 43, email: "private@example.test" },
  createdAt: date,
};

function page(data, offset = 0) {
  return { data: data.map((item) => ({ data: item })), pagination: { offset, limit: 100 } };
}

function mockApi(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    let value;
    if (parsed.pathname.endsWith("/files/14")) value = { data: file };
    else if (parsed.pathname.endsWith("/strings"))
      value = page(Array.from({ length: 13 }, (_, i) => source(i + 1)));
    else if (parsed.pathname.endsWith("/translations")) value = page([]);
    else if (parsed.pathname.endsWith("/approvals")) value = page([]);
    else value = { data: project };
    const suffix = parsed.pathname.replace("/api/v2/projects/927431", "") || "/";
    if (Object.hasOwn(overrides, suffix))
      value =
        typeof overrides[suffix] === "function"
          ? overrides[suffix](parsed, calls)
          : overrides[suffix];
    return new Response(JSON.stringify(value), { status: 200 });
  };
  return { fetchImpl, calls };
}

async function collect(overrides) {
  return collectNativeSnapshot({
    token: "test-not-a-secret",
    ...mockApi(overrides),
    now: () => date,
  });
}

describe("native Crowdin read", () => {
  it("accepts empty draft state and does not claim review proof", async () => {
    const snapshot = await collect();
    expect(snapshot.strings).toHaveLength(13);
    expect(snapshot.translations).toEqual([]);
    expect(snapshot.approvals).toEqual([]);
    expect(snapshot.atomicSnapshot).toBe(false);
    expect(snapshot.approvalTimeContentProved).toBe(false);
    expect(snapshot.humanApprovalProved).toBe(false);
    expect(snapshot.deliveryAuthorized).toBe(false);
  });

  it("uses the exact origin, only GET, and refuses redirects", async () => {
    const api = mockApi();
    await collectNativeSnapshot({ token: "test-not-a-secret", ...api, now: () => date });
    expect(api.calls).toHaveLength(6);
    for (const call of api.calls) {
      expect(call.url.startsWith("https://api.crowdin.com/api/v2/projects/927431")).toBe(true);
      expect(call.options.method).toBe("GET");
      expect(call.options.redirect).toBe("error");
      expect(call.options.body).toBeUndefined();
      expect(call.options.signal).toBeInstanceOf(AbortSignal);
    }
    expect(api.calls[4].url).toContain("/approvals?languageId=zh-CN&fileId=14");
  });

  it("whitelists metadata and retains native approval references without fabricating approved text", async () => {
    const snapshot = await collect({
      "/languages/zh-CN/translations": page([translation()]),
      "/approvals": page([approval]),
    });
    const text = JSON.stringify(snapshot);
    expect(text).not.toContain("private@example.test");
    expect(text).not.toContain("Private Name");
    expect(text).not.toContain("test-not-a-secret");
    expect(text).not.toContain("approvedText");
    expect(snapshot.approvals[0]).toEqual({
      id: 51,
      translationId: 101,
      stringId: 1,
      languageId: "zh-CN",
      userId: 43,
      createdAt: date,
    });
  });

  it.each([
    ["id", 923331],
    ["identifier", "old-project"],
    ["sourceLanguageId", "fr"],
    ["targetLanguageIds", ["zh-CN", "ja"]],
    ["visibility", "public"],
  ])("rejects project mismatch %s", (key, value) => {
    expect(() => selectProject({ ...project, [key]: value })).toThrow("project identity");
  });

  it.each([
    ["id", 15],
    ["projectId", 923331],
    ["name", "other.po"],
    ["revisionId", 2],
    ["branchId", 8],
    ["directoryId", 9],
  ])("rejects file mismatch %s", (key, value) => {
    expect(() => selectFile({ ...file, [key]: value })).toThrow();
  });

  it("rejects source scope mismatch and unsupported plural source shape", () => {
    expect(() => selectString({ ...source(1), fileId: 15 })).toThrow("scope");
    expect(() => selectString({ ...source(1), text: { other: "Plural" } })).toThrow("text");
  });

  it("rejects bad native IDs, dates and approval language", () => {
    expect(() => selectTranslation({ ...translation(), translationId: null })).toThrow("ID");
    expect(() => selectTranslation({ ...translation(), createdAt: "bad" })).toThrow("date");
    expect(() => selectApproval({ ...approval, languageId: "ja" })).toThrow("language");
  });

  it("preserves plural native IDs and sanitizes nested users", () => {
    const value = selectTranslation({
      stringId: 1,
      contentType: "application/vnd.crowdin.plurals+json",
      plurals: [{ ...translation(), pluralForm: "other" }],
    });
    expect(value.plurals[0]).toEqual({
      translationId: 101,
      text: "测试",
      userId: 42,
      createdAt: date,
      pluralForm: "other",
    });
    expect(() => selectTranslation({ ...value, plurals: [] })).toThrow("count");
  });

  it("requires exactly thirteen sources", async () => {
    await expect(collect({ "/strings": page([source(1)]) })).rejects.toThrow("13");
  });

  it("rejects duplicate records", async () => {
    await expect(collect({ "/strings": page([source(1), source(1)]) })).rejects.toThrow(
      "Duplicate",
    );
  });

  it("rejects references to another source", async () => {
    await expect(collect({ "/approvals": page([{ ...approval, stringId: 999 }]) })).rejects.toThrow(
      "unknown source",
    );
  });

  it("reads complete paginated approval records", async () => {
    const snapshot = await collect({
      "/approvals": (url) => {
        const offset = Number(url.searchParams.get("offset"));
        return page(
          Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => ({
            ...approval,
            id: offset + i + 1,
          })),
          offset,
        );
      },
    });
    expect(snapshot.approvals).toHaveLength(101);
  });

  it("rejects pagination stall", async () => {
    await expect(
      collect({
        "/approvals": () =>
          page(Array.from({ length: 100 }, (_, i) => ({ ...approval, id: i + 1 }))),
      }),
    ).rejects.toThrow("pagination mismatch");
  });

  it("rejects duplicate records across pages", async () => {
    await expect(
      collect({
        "/approvals": (url) =>
          page(
            Array.from({ length: 100 }, (_, i) => ({ ...approval, id: i + 1 })),
            Number(url.searchParams.get("offset")),
          ),
      }),
    ).rejects.toThrow("Duplicate");
  });

  it("fails closed when pagination exceeds the bounded workload", async () => {
    await expect(
      collect({
        "/approvals": (url) => {
          const offset = Number(url.searchParams.get("offset"));
          return page(
            Array.from({ length: 100 }, (_, i) => ({ ...approval, id: offset + i + 1 })),
            offset,
          );
        },
      }),
    ).rejects.toThrow("bound reached");
  });

  it("rechecks source revision at the end", async () => {
    let reads = 0;
    await expect(
      collect({ "/files/14": () => ({ data: { ...file, revisionId: ++reads } }) }),
    ).rejects.toThrow("revision mismatch");
  });

  it("does not expose token or upstream errors", async () => {
    await expect(
      collectNativeSnapshot({
        token: "test-secret",
        fetchImpl: async () => {
          throw new Error("test-secret upstream private data");
        },
      }),
    ).rejects.toThrow("No response details");
    await expect(
      collectNativeSnapshot({
        token: "test-secret",
        fetchImpl: async () => new Response("test-secret", { status: 403 }),
      }),
    ).rejects.toThrow("read request was rejected");
    await expect(
      collectNativeSnapshot({
        token: "test-secret",
        fetchImpl: async () => new Response("test-secret"),
      }),
    ).rejects.toThrow("bounded JSON");
  });

  it("rejects oversized response", async () => {
    await expect(
      collectNativeSnapshot({
        token: "test-secret",
        fetchImpl: async () => new Response(" ".repeat(1024 * 1024 + 1)),
      }),
    ).rejects.toThrow("bounded JSON");
  });

  it("reports fixed scope and HTTP status without response details", async () => {
    try {
      await collectNativeSnapshot({
        token: "test-secret",
        fetchImpl: async () => new Response("private body", { status: 403 }),
      });
      expect.fail("Expected failure");
    } catch (error) {
      const message = safeFailureMessage(error);
      expect(message).toContain("/projects/927431");
      expect(message).toContain("HTTP 403");
      expect(message).not.toContain("private body");
      expect(message).not.toContain("test-secret");
    }
  });

  it("reports internal schema failures and hides all unknown error messages", () => {
    try {
      selectProject({ ...project, id: 923331 });
      expect.fail("Expected failure");
    } catch (error) {
      expect(safeFailureMessage(error)).toContain("project identity mismatch");
    }
    expect(safeFailureMessage(new Error("Bearer private-secret"))).not.toContain("private-secret");
    expect(safeFailureMessage({ message: "private-secret" })).not.toContain("private-secret");
  });

  it("rejects missing credentials before any request", async () => {
    await expect(collectNativeSnapshot({ token: "" })).rejects.toThrow("token");
  });

  it("keeps workflow narrow, read-only and secret-scoped", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/crowdin-ai-evidence.yml", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("- aidan/crowdin-ai-recording-02");
    expect(workflow).toContain(`github.repository == '${nativeScope.repository}'`);
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("retention-days: 7");
    expect(workflow).toContain("timeout-minutes: 5");
    expect(workflow).not.toMatch(/pull_request|workflow_dispatch|contents: write|pnpm install/u);
    expect(workflow.match(/secrets\./gu)).toHaveLength(1);
  });
});
