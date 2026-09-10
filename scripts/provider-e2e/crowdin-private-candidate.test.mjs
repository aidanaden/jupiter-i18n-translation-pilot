import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { formatter } from "@lingui/format-po";
import { describe, expect, it } from "vitest";

import { preparePrivateCandidate, verifyPrivateCandidate } from "./crowdin-private-candidate.mjs";

const baseSha = "be101fae90c42554de45deb5393b19771aa1318f";
const sourcePo = execFileSync("git", ["show", `${baseSha}:src/i18n/locales/en/messages.po`], {
  encoding: "utf8",
});
const baselineTargetPo = execFileSync(
  "git",
  ["show", `${baseSha}:src/i18n/locales/zh-Hans/messages.po`],
  { encoding: "utf8" },
);

function syntheticEvidence() {
  const labels = [
    ["balance", "Balance {balance}", "余额 {balance}"],
    ["limit", "Limit", "限价"],
    ["market", "Market", "市价"],
    ["pay", "You pay", "您支付"],
    ["receive", "You receive", "您将收到"],
    ["recurring", "Recurring", "定期"],
  ];
  const state = {
    projectId: 929237,
    fileId: 24,
    branchName: "aidan.crowdin-private-source-20260911",
    revision: 1,
    entries: labels.map(([key, source, translation], index) => ({
      identifier: `swap.form.${key}`,
      stringId: index + 1,
      source,
      sourceUpdatedAt: "2026-09-11T01:00:00Z",
      translationId: index + 11,
      translation,
      translatedAt: "2026-09-11T01:01:00Z",
      approvalId: index + 21,
      approvedTranslationId: index + 11,
      reviewerId: 17853021,
      languageId: "zh-CN",
      approvedAt: "2026-09-11T01:02:00Z",
    })),
  };
  return {
    startedAt: "2026-09-11T01:03:00Z",
    completedAt: "2026-09-11T01:03:10Z",
    now: "2026-09-11T01:03:11Z",
    first: state,
    second: structuredClone(state),
  };
}

function gitBlob(text) {
  return createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex");
}

function candidateInput() {
  const evidence = syntheticEvidence();
  const { candidatePo } = preparePrivateCandidate({ sourcePo, baselineTargetPo, evidence });
  const baseTree = [
    { path: "src/i18n/locales/en/messages.po", mode: "100644", oid: gitBlob(sourcePo) },
    {
      path: "src/i18n/locales/zh-Hans/messages.po",
      mode: "100644",
      oid: gitBlob(baselineTargetPo),
    },
    { path: ".github/workflows/check.yml", mode: "100644", oid: "a".repeat(40) },
  ];
  return {
    repository: "aidanaden/jupiter-i18n-translation-pilot",
    baseBranch: "aidan/crowdin-private-source-20260911",
    baseSha,
    currentBaseSha: baseSha,
    mergeBase: baseSha,
    headSha: "b".repeat(40),
    sourcePo,
    baselineTargetPo,
    evidence,
    candidatePo,
    baseTree,
    candidateTree: baseTree.map((entry) =>
      entry.path === "src/i18n/locales/zh-Hans/messages.po"
        ? { ...entry, oid: gitBlob(candidatePo) }
        : { ...entry },
    ),
  };
}

describe("local private candidate with synthetic review evidence", () => {
  it.each([
    [
      "missing approval",
      (evidence) => {
        delete evidence.first.entries[0].approvalId;
      },
    ],
    [
      "wrong approval",
      (evidence) => {
        evidence.first.entries[0].approvedTranslationId = 999;
      },
    ],
    [
      "missing label",
      (evidence) => {
        evidence.first.entries.pop();
      },
    ],
    [
      "duplicate label",
      (evidence) => {
        evidence.first.entries[0] = evidence.first.entries[1];
      },
    ],
    [
      "stale evidence",
      (evidence) => {
        evidence.now = "2026-09-11T01:09:00Z";
      },
    ],
    [
      "invalid catalog text",
      (evidence) => {
        evidence.first.entries[1].translation = "<script>限价</script>";
      },
    ],
  ])("rejects %s", (_name, change) => {
    const evidence = syntheticEvidence();
    change(evidence);
    evidence.second = structuredClone(evidence.first);
    expect(() => preparePrivateCandidate({ sourcePo, baselineTargetPo, evidence })).toThrow();
  });
  it("rejects evidence changed between reads", () => {
    const evidence = syntheticEvidence();
    evidence.second.revision = 2;
    expect(() => preparePrivateCandidate({ sourcePo, baselineTargetPo, evidence })).toThrow(
      /changed/,
    );
  });
  it.each([
    [
      "another repository",
      (input) => {
        input.repository = "other/repo";
      },
    ],
    [
      "another branch",
      (input) => {
        input.baseBranch = "main";
      },
    ],
    [
      "another pinned base",
      (input) => {
        input.baseSha = "c".repeat(40);
        input.currentBaseSha = input.baseSha;
        input.mergeBase = input.baseSha;
      },
    ],
    [
      "stale base",
      (input) => {
        input.currentBaseSha = "c".repeat(40);
      },
    ],
    [
      "wrong ancestry",
      (input) => {
        input.mergeBase = "c".repeat(40);
      },
    ],
    [
      "invalid head",
      (input) => {
        input.headSha = "not-a-sha";
      },
    ],
    [
      "unchanged head",
      (input) => {
        input.headSha = baseSha;
      },
    ],
    [
      "extra candidate bytes",
      (input) => {
        input.candidatePo += "\n";
      },
    ],
    [
      "source blob change",
      (input) => {
        input.candidateTree[0].oid = "c".repeat(40);
      },
    ],
    [
      "unrelated workflow change",
      (input) => {
        input.candidateTree[2].oid = "c".repeat(40);
      },
    ],
    [
      "target mode change",
      (input) => {
        input.candidateTree[1].mode = "120000";
      },
    ],
    [
      "missing tree entry",
      (input) => {
        input.candidateTree.pop();
      },
    ],
    [
      "extra tree entry",
      (input) => {
        input.candidateTree.push({ path: "extra", mode: "100644", oid: "c".repeat(40) });
      },
    ],
    [
      "duplicate tree entry",
      (input) => {
        input.candidateTree.push(input.candidateTree[0]);
      },
    ],
    [
      "invalid tree path",
      (input) => {
        input.baseTree[2].path = "../escape";
      },
    ],
    [
      "conflicting tree path",
      (input) => {
        input.baseTree.push({ path: "src", mode: "100644", oid: "c".repeat(40) });
      },
    ],
    [
      "wrong baseline tree",
      (input) => {
        input.baseTree[1].oid = "c".repeat(40);
      },
    ],
  ])("rejects %s", (_name, change) => {
    const input = candidateInput();
    change(input);
    expect(() => verifyPrivateCandidate(input)).toThrow();
  });
  it("checks an exact candidate tree without granting remote authority", () => {
    expect(verifyPrivateCandidate(candidateInput())).toMatchObject({
      status: "local-candidate-verified",
      deliveryAllowed: false,
      mergeAllowed: false,
      deploymentAllowed: false,
      liveVerificationPerformed: false,
    });
  });
  it.each(["sourcePo", "baselineTargetPo"])("rejects any change to pinned %s", (key) => {
    const input = { sourcePo, baselineTargetPo, evidence: syntheticEvidence() };
    input[key] += "\n";
    expect(() => preparePrivateCandidate(input)).toThrow(/hash differs/);
  });
  it("fills six reviewed labels and preserves all other bytes and 13 accepted messages", () => {
    const result = preparePrivateCandidate({
      sourcePo,
      baselineTargetPo,
      evidence: syntheticEvidence(),
    });
    const before = baselineTargetPo.split("\n\n");
    const after = result.candidatePo.split("\n\n");
    expect(after.slice(0, 14)).toEqual(before.slice(0, 14));
    expect(after).toHaveLength(before.length);
    expect(after.slice(14).map((entry) => entry.replace(/^msgstr .*$/mu, 'msgstr ""'))).toEqual(
      before.slice(14),
    );
    const catalog = formatter({ explicitIdAsDefault: true }).parse(result.candidatePo);
    expect(Object.keys(catalog)).toHaveLength(19);
    expect(catalog["swap.form.pay"].translation).toBe("您支付");
    expect(catalog["swap.form.balance"].translation).toBe("余额 {balance}");
    expect(result.receipt).toMatchObject({
      preservedMessages: 13,
      reviewedMessages: 6,
      deliveryAllowed: false,
      mergeAllowed: false,
      deploymentAllowed: false,
      liveVerificationPerformed: false,
    });
  });
});
