import { execFileSync } from "node:child_process";

import { expect, test, vi } from "vitest";
import { formatter } from "@lingui/format-po";

import { prepareIncrementalDelivery } from "./crowdin-incremental-delivery.mjs";
import { collectIncrementalSnapshot } from "./crowdin-incremental-read.mjs";

function mockApi(change = () => {}) {
  const paths = [];
  const fetchImpl = vi.fn(async (url, options) => {
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://api.crowdin.com");
    expect(options.method).toBe("GET");
    expect(options.redirect).toBe("error");
    expect(options.headers.Authorization).toBe("Bearer synthetic-test-token");
    paths.push(parsed.pathname + parsed.search);
    const path = parsed.pathname.replace("/api/v2/projects/927431", "");
    const directories = {
      "/directories/54": { id: 54, name: "en", directoryId: 53, branchId: 50 },
      "/directories/53": { id: 53, name: "locales", directoryId: 52, branchId: 50 },
      "/directories/52": { id: 52, name: "i18n", directoryId: 51, branchId: 50 },
      "/directories/51": { id: 51, name: "src", directoryId: null, branchId: 50 },
    };
    const objects = {
      "": {
        id: 927431,
        identifier: "crowdin-ai-recording-02",
        sourceLanguageId: "en",
        targetLanguageIds: ["zh-CN"],
        visibility: "private",
      },
      "/files/26": {
        id: 26,
        projectId: 927431,
        name: "messages.po",
        revisionId: 2,
        branchId: 50,
        directoryId: 54,
      },
      "/branches/50": { id: 50, name: "aidan.provider-e2e-crowdin-ai-base" },
      ...directories,
    };
    const records = {
      "/strings": [
        {
          id: 104,
          projectId: 927431,
          fileId: 26,
          identifier: "pilot.recording.proof",
          text: "AI translation starts after a source update",
          revision: 1,
          createdAt: "2026-09-09T21:00:00Z",
          updatedAt: null,
        },
      ],
      "/languages/zh-CN/translations": [
        {
          stringId: 104,
          contentType: "text",
          translationId: 900,
          text: "源文本更新后，AI 翻译会自动开始",
          user: { id: 17853021 },
          createdAt: "2026-09-09T21:32:20Z",
        },
      ],
      "/approvals": [
        {
          id: 901,
          translationId: 900,
          stringId: 104,
          languageId: "zh-CN",
          user: { id: 17853021 },
          createdAt: "2026-09-09T21:33:20Z",
        },
      ],
    };
    if (!(path in objects) && !(path in records)) throw new Error("Unexpected API path");
    const body =
      path in objects
        ? { data: objects[path] }
        : {
            data: records[path].map((data) => ({ data })),
            pagination: { offset: Number(parsed.searchParams.get("offset")), limit: 100 },
          };
    const override = change({ path, body, call: paths.length, parsed });
    return (
      override ??
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })
    );
  });
  return { fetchImpl, paths };
}

test("API-shaped synthetic records pass the full preparation boundary", async () => {
  const base = "4a3b616c43a2f2bd32130cd56550d04affcb111f";
  const read = (path) => execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" });
  const sourcePo = read("src/i18n/locales/en/messages.po");
  const baselineTargetPo = read("src/i18n/locales/zh-Hans/messages.po");
  const entries = Object.entries(formatter({ explicitIdAsDefault: true }).parse(sourcePo));
  const api = mockApi(({ path, body }) => {
    if (path === "/strings")
      body.data = entries.map(([identifier, entry], index) => ({
        data: {
          ...body.data[0].data,
          id: identifier === "pilot.recording.proof" ? 104 : index + 1,
          identifier,
          text: entry.translation,
        },
      }));
  });
  const now = "2026-09-09T22:00:00Z";
  const snapshot = await collectIncrementalSnapshot({
    token: "synthetic-test-token",
    fetchImpl: api.fetchImpl,
    now: () => now,
  });
  expect(
    prepareIncrementalDelivery({ sourcePo, baselineTargetPo, snapshot, now }).receipt,
  ).toMatchObject({ preservedMessages: 12, approvalId: 901 });
});

test("makes two bounded read-only observations with no secret in the snapshot", async () => {
  const api = mockApi();
  const snapshot = await collectIncrementalSnapshot({
    token: "synthetic-test-token",
    fetchImpl: api.fetchImpl,
  });
  expect(api.paths).toHaveLength(20);
  expect(snapshot.first).toEqual(snapshot.second);
  expect(snapshot.first.file.id).toBe(26);
  expect(snapshot.first.approvals[0].translationId).toBe(900);
  expect(JSON.stringify(snapshot)).not.toContain("synthetic-test-token");
  expect(api.paths.join(" ")).not.toMatch(/files\/14|fileId=14|pre-translation|builds/);
});

test.each([
  ["HTTP refusal", () => new Response("secret must not reach an artifact", { status: 403 })],
  ["redirect", () => ({ ok: true, redirected: true })],
  ["oversized body", () => new Response("x".repeat(1000001))],
  ["malformed JSON", () => new Response("{")],
  [
    "file14",
    ({ path, body }) => {
      if (path === "/files/26") body.data.id = 14;
    },
  ],
  [
    "revision drift",
    ({ path, body }) => {
      if (path === "/files/26") body.data.revisionId = 3;
    },
  ],
  [
    "wrong branch",
    ({ path, body }) => {
      if (path === "/branches/50") body.data.name = "main";
    },
  ],
  [
    "wrong directory",
    ({ path, body }) => {
      if (path === "/directories/54") body.data.name = "zh-Hans";
    },
  ],
  [
    "wrong source scope",
    ({ path, body }) => {
      if (path === "/strings") body.data[0].data.fileId = 14;
    },
  ],
  [
    "pagination drift",
    ({ path, body }) => {
      if (path === "/strings") body.pagination.offset = 100;
    },
  ],
  [
    "duplicate record",
    ({ path, body }) => {
      if (path === "/strings") body.data.push(body.data[0]);
    },
  ],
  [
    "approval removed between reads",
    ({ path, body, call }) => {
      if (path === "/approvals" && call > 10) body.data = [];
    },
  ],
  [
    "unbounded pages",
    ({ path, body, parsed }) => {
      if (path === "/strings")
        body.data = Array.from({ length: 100 }, (_, i) => ({
          data: { ...body.data[0].data, id: Number(parsed.searchParams.get("offset")) + i + 1 },
        }));
    },
  ],
])("rejects %s", async (_name, change) => {
  const api = mockApi(change);
  await expect(
    collectIncrementalSnapshot({ token: "synthetic-test-token", fetchImpl: api.fetchImpl }),
  ).rejects.toThrow();
  expect(api.paths.length).toBeLessThanOrEqual(20);
});

test.each([undefined, "", "\r\ninvalid"])(
  "rejects missing or malformed token before reading",
  async (token) => {
    const fetchImpl = vi.fn();
    await expect(collectIncrementalSnapshot({ token, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  },
);

test.each([
  { args: [] },
  { args: ["deploy", "/tmp/not-created"] },
  { args: ["verify", "/tmp/not-created", "main"] },
  { args: ["prepare", "/tmp/not-created", "extra"] },
])("CLI rejects invalid arguments without exposing environment secrets: $args", ({ args }) => {
  let output = "";
  try {
    execFileSync(process.execPath, ["scripts/provider-e2e/crowdin-incremental-cli.mjs", ...args], {
      encoding: "utf8",
      env: { ...process.env, CROWDIN_PERSONAL_TOKEN: "synthetic-secret-never-print" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    expect(error.status).toBe(1);
    output = String(error.stderr);
  }
  expect(output).toContain("No authorization was issued");
  expect(output).not.toContain("synthetic-secret-never-print");
});
