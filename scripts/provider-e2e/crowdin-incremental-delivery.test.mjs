import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { expect, test } from "vitest";
import { formatter } from "@lingui/format-po";

import {
  NativeSourceMismatchError,
  prepareIncrementalDelivery,
  verifyIncrementalCandidate,
} from "./crowdin-incremental-delivery.mjs";

const base = "4a3b616c43a2f2bd32130cd56550d04affcb111f";
const read = (path) => execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" });
const sourcePo = read("src/i18n/locales/en/messages.po");
const baselineTargetPo = read("src/i18n/locales/zh-Hans/messages.po");
const now = "2026-09-09T22:00:00Z";
const corrected = "源文本更新后，AI 翻译会自动开始";
const blob = (value) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(value)}\0`)
    .update(value)
    .digest("hex");

test("source mismatch diagnostics expose only numeric IDs and comparison results", () => {
  const error = new NativeSourceMismatchError(
    { id: 104, revision: 2, projectId: 927431, fileId: 26, text: "private response" },
    "expected source",
  );
  expect(error.message).toBe("Native source changed");
  expect(error.facts).toEqual({
    id: 104,
    revision: 2,
    projectMatches: true,
    fileMatches: true,
    textMatches: false,
  });
  const unsafe = new NativeSourceMismatchError({ id: "secret", revision: "secret" }, "source");
  expect(unsafe.facts.id).toBeNull();
  expect(unsafe.facts.revision).toBeNull();
  expect(JSON.stringify([error, unsafe])).not.toContain("secret");
  expect(JSON.stringify(error)).not.toContain("private response");
});

function input() {
  const strings = Object.entries(formatter({ explicitIdAsDefault: true }).parse(sourcePo)).map(
    ([identifier, entry], index) => ({
      id: index + 1,
      projectId: 927431,
      fileId: 26,
      identifier,
      text: entry.translation,
      revision: 2,
      createdAt: "2026-09-09T21:00:00Z",
      updatedAt: null,
    }),
  );
  const stringId = strings.find((entry) => entry.identifier === "pilot.recording.proof").id;
  const state = {
    project: {
      id: 927431,
      identifier: "crowdin-ai-recording-02",
      sourceLanguageId: "en",
      targetLanguageIds: ["zh-CN"],
      visibility: "private",
    },
    file: {
      id: 26,
      projectId: 927431,
      name: "messages.po",
      revisionId: 2,
      branchId: 50,
      directoryId: 54,
    },
    branch: { id: 50, name: "aidan.provider-e2e-crowdin-ai-base" },
    directories: [
      { id: 54, name: "en", directoryId: 53, branchId: 50 },
      { id: 53, name: "locales", directoryId: 52, branchId: 50 },
      { id: 52, name: "i18n", directoryId: 51, branchId: 50 },
      { id: 51, name: "src", directoryId: null, branchId: 50 },
    ],
    strings,
    translations: [
      {
        stringId,
        contentType: "text",
        translationId: 900,
        text: corrected,
        userId: 17853021,
        createdAt: "2026-09-09T21:32:20Z",
      },
    ],
    approvals: [
      {
        id: 901,
        translationId: 900,
        stringId,
        languageId: "zh-CN",
        userId: 17853021,
        createdAt: "2026-09-09T21:33:20Z",
      },
    ],
  };
  return {
    sourcePo,
    baselineTargetPo,
    now,
    snapshot: {
      format: "crowdin-incremental-read-v1",
      startedAt: "2026-09-09T21:59:00Z",
      completedAt: "2026-09-09T21:59:10Z",
      first: structuredClone(state),
      second: structuredClone(state),
    },
  };
}

test("prepares only the reviewed message and preserves every other byte", () => {
  const result = prepareIncrementalDelivery(input());
  expect(result.candidatePo).toBe(
    baselineTargetPo.replace('msgstr "翻译排练完成"', `msgstr "${corrected}"`),
  );
  expect(result.receipt).toMatchObject({
    fileId: 26,
    sourceRevision: 2,
    approvalId: 901,
    translationId: 900,
    preservedMessages: 12,
    reviewerDisclosure: "Automated test reviewer. No human language review.",
    deliveryAllowed: false,
    humanApprovalProved: false,
    approvalTimeContentProved: false,
  });
});

test.each([
  [
    "wrong file",
    (state) => {
      state.file.id = 14;
    },
  ],
  [
    "wrong revision",
    (state) => {
      state.file.revisionId = 3;
    },
  ],
  [
    "wrong project",
    (state) => {
      state.project.id = 1;
    },
  ],
  [
    "unbranched file",
    (state) => {
      state.file.branchId = null;
    },
  ],
  [
    "wrong branch",
    (state) => {
      state.branch.name = "main";
    },
  ],
  [
    "wrong directory",
    (state) => {
      state.directories[0].name = "zh-Hans";
    },
  ],
  [
    "broken directory chain",
    (state) => {
      state.directories[1].id = 99;
    },
  ],
  [
    "changed source",
    (state) => {
      state.strings[0].text += " changed";
    },
  ],
  [
    "missing source",
    (state) => {
      state.strings.pop();
    },
  ],
  [
    "duplicate source",
    (state) => {
      state.strings[0].id = state.strings[1].id;
    },
  ],
  [
    "missing translation",
    (state) => {
      state.translations = [];
    },
  ],
  [
    "changed wording",
    (state) => {
      state.translations[0].text += "!";
    },
  ],
  [
    "wrong translator",
    (state) => {
      state.translations[0].userId = 2;
    },
  ],
  [
    "wrong reviewer",
    (state) => {
      state.approvals[0].userId = 2;
    },
  ],
  [
    "revoked approval",
    (state) => {
      state.approvals = [];
    },
  ],
  [
    "wrong translation approval",
    (state) => {
      state.approvals[0].translationId = 899;
    },
  ],
  [
    "approval before correction",
    (state) => {
      state.approvals[0].createdAt = "2026-09-09T21:31:00Z";
    },
  ],
  [
    "correction before source",
    (state) => {
      state.translations[0].createdAt = "2026-09-09T20:00:00Z";
    },
  ],
  [
    "older source revision",
    (state) => {
      state.strings.find((entry) => entry.identifier === "pilot.recording.proof").revision = 1;
    },
  ],
  [
    "later source revision",
    (state) => {
      state.strings.find((entry) => entry.identifier === "pilot.recording.proof").revision = 3;
    },
  ],
  [
    "source changed after correction",
    (state) => {
      state.strings.find((entry) => entry.identifier === "pilot.recording.proof").updatedAt =
        "2026-09-09T21:40:00Z";
    },
  ],
  [
    "future approval",
    (state) => {
      state.approvals[0].createdAt = "2026-09-10T00:00:00Z";
    },
  ],
  [
    "duplicate approval",
    (state) => {
      state.approvals.push(structuredClone(state.approvals[0]));
    },
  ],
])("rejects %s", (_name, mutate) => {
  const data = input();
  mutate(data.snapshot.first);
  data.snapshot.second = structuredClone(data.snapshot.first);
  expect(() => prepareIncrementalDelivery(data)).toThrow();
});

test("rejects state that changes between the two reads", () => {
  const data = input();
  data.snapshot.second.approvals = [];
  expect(() => prepareIncrementalDelivery(data)).toThrow(/changed/);
});

test.each(["2026-09-09T22:06:01Z", "2026-09-09T21:58:00Z", "invalid"])(
  "rejects stale or invalid observation time %s",
  (time) => {
    expect(() => prepareIncrementalDelivery({ ...input(), now: time })).toThrow();
  },
);

test.each(["sourcePo", "baselineTargetPo"])("rejects drift in %s", (field) => {
  const data = input();
  data[field] += "\n";
  expect(() => prepareIncrementalDelivery(data)).toThrow(/hash/);
});

function candidateInput() {
  const data = input();
  const prepared = prepareIncrementalDelivery(data);
  const baseTree = [
    { path: "src/i18n/locales/en/messages.po", mode: "100644", oid: blob(sourcePo) },
    { path: "src/i18n/locales/zh-Hans/messages.po", mode: "100644", oid: blob(baselineTargetPo) },
    { path: "README.md", mode: "100644", oid: "a".repeat(40) },
  ];
  return {
    ...data,
    repository: "aidanaden/jupiter-i18n-translation-pilot",
    baseBranch: "aidan/provider-e2e-crowdin-ai-base",
    baseSha: base,
    currentBaseSha: base,
    mergeBase: base,
    headSha: "b".repeat(40),
    candidatePo: prepared.candidatePo,
    baseTree,
    candidateTree: baseTree.map((entry) =>
      entry.path.includes("zh-Hans") ? { ...entry, oid: blob(prepared.candidatePo) } : { ...entry },
    ),
  };
}

test("verifies a target-only candidate, without authorizing merge", () => {
  expect(verifyIncrementalCandidate(candidateInput())).toMatchObject({
    status: "candidate-verified",
    mergeAllowed: false,
    deploymentAllowed: false,
  });
});

test.each([
  [
    "unrelated file",
    (data) => {
      data.candidateTree[2].oid = "c".repeat(40);
    },
  ],
  [
    "mode change",
    (data) => {
      data.candidateTree[1].mode = "100755";
    },
  ],
  [
    "deleted path",
    (data) => {
      data.candidateTree.pop();
    },
  ],
  [
    "duplicate path",
    (data) => {
      data.candidateTree.push(data.candidateTree[0]);
    },
  ],
  [
    "source change",
    (data) => {
      data.candidateTree[0].oid = "c".repeat(40);
    },
  ],
  [
    "wrong target",
    (data) => {
      data.candidatePo += "\n";
    },
  ],
  [
    "stale base",
    (data) => {
      data.currentBaseSha = "c".repeat(40);
    },
  ],
  [
    "wrong ancestry",
    (data) => {
      data.mergeBase = "c".repeat(40);
    },
  ],
  [
    "wrong repo",
    (data) => {
      data.repository = "other/repo";
    },
  ],
  [
    "main branch",
    (data) => {
      data.baseBranch = "main";
    },
  ],
  [
    "unchanged head",
    (data) => {
      data.headSha = base;
    },
  ],
  [
    "bad base tree blob",
    (data) => {
      data.baseTree[1].oid = "c".repeat(40);
    },
  ],
])("rejects candidate %s", (_name, mutate) => {
  const data = candidateInput();
  mutate(data);
  expect(() => verifyIncrementalCandidate(data)).toThrow();
});
