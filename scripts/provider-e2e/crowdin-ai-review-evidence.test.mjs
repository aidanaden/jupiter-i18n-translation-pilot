import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { formatter } from "@lingui/format-po";
import { describe, expect, it } from "vitest";

import { nativeScope } from "./crowdin-ai-native-read.mjs";
import { createCrowdinAiBaseline, stageCrowdinAiCandidate } from "./crowdin-ai-cycle.mjs";
import { lingoJsonToPo } from "./lingo-json.mjs";
import { captureCrowdinAiReview, finalizeCrowdinAiReview } from "./crowdin-ai-review-evidence.mjs";

const sourcePo = readFileSync(
  new URL("../../src/i18n/locales/en/messages.po", import.meta.url),
  "utf8",
);
const source = formatter({ explicitIdAsDefault: true }).parse(sourcePo);
const disclosure = "Automated test reviewer. No human language review.";
const createdAt = "2026-09-09T00:00:00Z";
const snapshot = {
  format: "crowdin-native-read-snapshot-v1",
  scope: nativeScope,
  startedAt: "2026-09-09T00:01:00Z",
  completedAt: "2026-09-09T00:01:10Z",
  atomicSnapshot: false,
  approvalTimeContentProved: false,
  humanApprovalProved: false,
  deliveryAuthorized: false,
  project: {
    id: 927431,
    identifier: "crowdin-ai-recording-02",
    sourceLanguageId: "en",
    targetLanguageIds: ["zh-CN"],
    visibility: "private",
  },
  file: {
    id: 14,
    projectId: 927431,
    name: "messages.po",
    revisionId: 1,
    branchId: null,
    directoryId: null,
  },
  strings: Object.entries(source).map(([identifier, entry], i) => ({
    id: i + 1,
    projectId: 927431,
    fileId: 14,
    identifier,
    text: entry.translation,
    context: "test context",
    revision: 1,
    createdAt,
    updatedAt: null,
  })),
  translations: Object.keys(source).map((_, i) => ({
    stringId: i + 1,
    contentType: "text/plain",
    translationId: i + 101,
    text: `测试 ${i}`,
    userId: 99,
    createdAt,
  })),
  approvals: [],
  requests: [
    {
      path: "/projects/927431/strings?fileId=14&limit=100&offset=0",
      receivedAt: "2026-09-09T00:01:05Z",
    },
  ],
};
const input = {
  nativeSnapshot: snapshot,
  sourcePo,
  reviewerUserId: 42,
  capturedAt: "2026-09-09T00:01:15Z",
  reviewerDisclosure: disclosure,
};
const clone = (value) => structuredClone(value);
const later = () => ({
  ...clone(snapshot),
  startedAt: "2026-09-09T00:05:00Z",
  completedAt: "2026-09-09T00:05:10Z",
  requests: [
    {
      path: "/projects/927431/approvals?languageId=zh-CN&fileId=14&limit=100&offset=0",
      receivedAt: "2026-09-09T00:05:05Z",
    },
  ],
  approvals: snapshot.translations.map((item, i) => ({
    id: i + 201,
    translationId: item.translationId,
    stringId: item.stringId,
    languageId: "zh-CN",
    userId: 42,
    createdAt: "2026-09-09T00:03:00Z",
  })),
});

function finalize(changed = later(), capture = captureCrowdinAiReview(input)) {
  return finalizeCrowdinAiReview({
    capture,
    expectedCaptureDigest: capture.digest,
    nativeSnapshot: changed,
    sourcePo,
  });
}

describe("Crowdin pre-review evidence adapter", () => {
  it("captures exact content before review and joins all native approvals", () => {
    const capture = captureCrowdinAiReview(input);
    const result = finalize(later(), capture);
    expect(Object.isFrozen(capture.entries[0])).toBe(true);
    expect(result.evidence.format).toBe("normalized-review-snapshot-v1");
    expect(result.evidence.entries).toHaveLength(13);
    expect(result.evidence.entries[0]).toEqual({
      messageId: snapshot.strings[0].identifier,
      stringId: 1,
      sourceText: snapshot.strings[0].text,
      sourceRevision: 1,
      translationId: 101,
      translationHash: createHash("sha256").update("测试 0").digest("hex"),
      translationText: "测试 0",
      approvalId: 201,
      approvedTranslationId: 101,
      approvedTranslationHash: createHash("sha256").update("测试 0").digest("hex"),
      approvedSourceRevision: 1,
      approvedText: "测试 0",
    });
    expect(result.receipt.humanApprovalProved).toBe(false);
    expect(result.receipt.atomicSnapshot).toBe(false);
    expect(result.receipt.approvalTimeContentProved).toBe(false);
    expect(result.receipt.liveStateProved).toBe(false);
    expect(result.receipt.deliveryAllowed).toBe(false);
    expect(result.receipt.reviewerDisclosure).toBe(disclosure);
    expect(result.receipt.captureDigest).toBe(capture.digest);
  });

  it("rejects a later snapshot alone", () => {
    expect(() => finalizeCrowdinAiReview({ nativeSnapshot: later(), sourcePo })).toThrow();
  });

  it.each([
    [
      "scope",
      (value) => {
        value.scope.projectId = 923331;
      },
    ],
    [
      "project",
      (value) => {
        value.project.id = 923331;
      },
    ],
    [
      "file",
      (value) => {
        value.file.id = 15;
      },
    ],
    [
      "revision",
      (value) => {
        value.file.revisionId = 2;
      },
    ],
    [
      "missing source",
      (value) => {
        value.strings.pop();
      },
    ],
    [
      "missing translation",
      (value) => {
        value.translations.pop();
      },
    ],
    [
      "duplicate string",
      (value) => {
        value.strings[1] = value.strings[0];
      },
    ],
    [
      "duplicate translation",
      (value) => {
        value.translations[1].translationId = 101;
      },
    ],
    [
      "wrong text",
      (value) => {
        value.strings[0].text = "different";
      },
    ],
    [
      "source reference",
      (value) => {
        value.translations[0].stringId = 999;
      },
    ],
    [
      "plural ambiguity",
      (value) => {
        value.translations[0].plurals = [];
      },
    ],
    [
      "empty target",
      (value) => {
        value.translations[0].text = " ";
      },
    ],
    [
      "pre-existing approval",
      (value) => {
        value.approvals = later().approvals;
      },
    ],
  ])("rejects capture %s", (_label, change) => {
    const value = clone(snapshot);
    change(value);
    expect(() => captureCrowdinAiReview({ ...input, nativeSnapshot: value })).toThrow();
  });

  it("requires explicit test disclosure, pinned source, reviewer ID and fresh pre-review capture", () => {
    expect(() =>
      captureCrowdinAiReview({ ...input, reviewerDisclosure: "Human approved" }),
    ).toThrow();
    expect(() => captureCrowdinAiReview({ ...input, sourcePo: `${sourcePo}\n` })).toThrow();
    expect(() => captureCrowdinAiReview({ ...input, reviewerUserId: 0 })).toThrow();
    expect(() =>
      captureCrowdinAiReview({ ...input, capturedAt: "2026-09-09T00:00:00Z" }),
    ).toThrow();
    expect(() =>
      captureCrowdinAiReview({ ...input, capturedAt: "2026-09-09T00:07:00Z" }),
    ).toThrow();
  });

  it.each([
    [
      "missing approval",
      (value) => {
        value.approvals.pop();
      },
    ],
    [
      "duplicate approval",
      (value) => {
        value.approvals[1].id = 201;
      },
    ],
    [
      "wrong approver",
      (value) => {
        value.approvals[0].userId = 43;
      },
    ],
    [
      "wrong translation ID",
      (value) => {
        value.approvals[0].translationId = 999;
      },
    ],
    [
      "wrong string ID",
      (value) => {
        value.approvals[0].stringId = 999;
      },
    ],
    [
      "approval before capture",
      (value) => {
        value.approvals[0].createdAt = createdAt;
      },
    ],
    [
      "approval after collection",
      (value) => {
        value.approvals[0].createdAt = "2026-09-09T00:06:00Z";
      },
    ],
    [
      "missing approval date",
      (value) => {
        delete value.approvals[0].createdAt;
      },
    ],
    [
      "wrong language",
      (value) => {
        value.approvals[0].languageId = "ja";
      },
    ],
    [
      "changed translation",
      (value) => {
        value.translations[0].text = "changed";
      },
    ],
    [
      "changed translation identity",
      (value) => {
        value.translations[0].translationId = 999;
      },
    ],
    [
      "changed source revision",
      (value) => {
        value.strings[0].revision = 2;
      },
    ],
    [
      "changed source timestamp",
      (value) => {
        value.strings[0].updatedAt = "2026-09-09T00:02:00Z";
      },
    ],
    [
      "overlapping collection",
      (value) => {
        value.startedAt = createdAt;
      },
    ],
  ])("rejects final %s", (_label, change) => {
    const value = later();
    change(value);
    expect(() => finalize(value)).toThrow();
  });

  it("rejects altered capture or wrong externally saved digest", () => {
    const capture = clone(captureCrowdinAiReview(input));
    capture.entries[0].translationText = "forged";
    expect(() => finalize(later(), capture)).toThrow();
    const valid = captureCrowdinAiReview(input);
    expect(() =>
      finalizeCrowdinAiReview({
        capture: valid,
        expectedCaptureDigest: "a".repeat(64),
        nativeSnapshot: later(),
        sourcePo,
      }),
    ).toThrow();
  });

  it("does not depend on API record order", () => {
    const value = later();
    value.strings.reverse();
    value.translations.reverse();
    value.approvals.reverse();
    expect(finalize(value).evidence).toEqual(finalize().evidence);
  });

  it("produces evidence accepted by the existing cycle contract", () => {
    const before = clone(snapshot);
    before.translations = before.translations.map((item, i) => ({
      ...item,
      text: before.strings[i].text,
    }));
    const capture = captureCrowdinAiReview({ ...input, nativeSnapshot: before });
    const after = later();
    after.translations = before.translations;
    const joined = finalize(after, capture);
    const head = "96bbb4619507225bf663b44b221ded24b95f9777";
    const options = { encoding: "utf8", cwd: new URL("../../", import.meta.url) };
    const targetPo = execFileSync(
      "git",
      ["show", `${head}:src/i18n/locales/zh-Hans/messages.po`],
      options,
    );
    const tree = execFileSync("git", ["ls-tree", "-rz", head], options)
      .split("\0")
      .filter(Boolean)
      .map((record) => {
        const split = record.indexOf("\t");
        const [mode, , oid] = record.slice(0, split).split(" ");
        return { path: record.slice(split + 1), mode, oid };
      });
    const baseline = createCrowdinAiBaseline({
      manifest: {
        repository: nativeScope.repository,
        baseBranch: "aidan/provider-e2e-crowdin-ai-base",
        candidateBranch: "aidan/crowdin-ai-candidate-review-test",
        baseHead: head,
        baseTreeOid: execFileSync("git", ["rev-parse", `${head}^{tree}`], options).trim(),
        pinnedSourceHead: head,
        projectSlug: nativeScope.projectSlug,
        projectId: 927431,
        branchId: null,
        fileId: 14,
        sourceRevision: 1,
        sourceHash: joined.evidence.sourceHash,
        providerLanguage: "zh-CN",
        repositoryLanguage: "zh-Hans",
        reviewerDisclosure: disclosure,
      },
      current: { head, sourcePo, targetPo, tree },
    });
    const exportedPo = lingoJsonToPo(
      sourcePo,
      Object.fromEntries(
        joined.evidence.entries.map((entry) => [entry.messageId, entry.translationText]),
      ),
      { expectedMessageCount: 13 },
    );
    const candidate = stageCrowdinAiCandidate({
      baseline,
      expectedManifestDigest: baseline.manifestDigest,
      current: baseline.current,
      evidence: joined.evidence,
      exportedPo,
    });
    expect(candidate.phase).toBe("fully-approved-candidate");
    expect(candidate.humanApprovalProved).toBe(false);
    expect(candidate.deliveryAllowed).toBe(false);
  });

  it("CLI refuses unsupported commands without revealing input details", () => {
    const result = spawnSync(
      process.execPath,
      [
        new URL("./crowdin-ai-review-evidence.mjs", import.meta.url).pathname,
        "publish",
        "private-input",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("capture|finalize INPUT_JSON");
    expect(result.stderr).not.toContain("private-input");
    expect(result.stdout).toBe("");
  });
});
