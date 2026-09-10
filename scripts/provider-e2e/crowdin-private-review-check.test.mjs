import { describe, expect, it } from "vitest";

import { checkPrivateReview } from "./crowdin-private-review-check.mjs";

function fixture() {
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

describe("private Crowdin review evidence", () => {
  it("accepts consistent synthetic review evidence without granting delivery", () => {
    expect(checkPrivateReview(fixture())).toMatchObject({
      reviewedMessages: 6,
      deliveryAllowed: false,
      mergeAllowed: false,
      deploymentAllowed: false,
      humanApprovalProved: false,
    });
  });
  it.each([
    [
      "missing approval",
      (state) => {
        delete state.entries[1].approvalId;
      },
    ],
    [
      "wrong reviewer",
      (state) => {
        state.entries[1].reviewerId = 1;
      },
    ],
    [
      "wrong project",
      (state) => {
        state.projectId = 927431;
      },
    ],
    [
      "wrong file",
      (state) => {
        state.fileId = 26;
      },
    ],
    [
      "wrong branch",
      (state) => {
        state.branchName = "main";
      },
    ],
    [
      "changed source",
      (state) => {
        state.entries[1].source = "Maximum";
      },
    ],
    [
      "missing label",
      (state) => {
        state.entries.pop();
      },
    ],
    [
      "duplicate label",
      (state) => {
        state.entries[1] = state.entries[0];
      },
    ],
    [
      "wrong translation approval",
      (state) => {
        state.entries[1].approvedTranslationId = 999;
      },
    ],
    [
      "duplicate placeholder",
      (state) => {
        state.entries[0].translation += " {balance}";
      },
    ],
    [
      "missing placeholder",
      (state) => {
        state.entries[0].translation = "余额";
      },
    ],
    [
      "approval before translation",
      (state) => {
        state.entries[0].approvedAt = "2026-09-11T01:00:00Z";
      },
    ],
    [
      "untranslated fallback",
      (state) => {
        state.entries[1].translation = "Limit";
      },
    ],
  ])("rejects %s", (_name, change) => {
    const evidence = fixture();
    change(evidence.first);
    evidence.second = structuredClone(evidence.first);
    expect(() => checkPrivateReview(evidence)).toThrow();
  });
  it("rejects stale or changing evidence", () => {
    const evidence = fixture();
    evidence.now = "2026-09-11T01:09:00Z";
    expect(() => checkPrivateReview(evidence)).toThrow(/stale/);
    evidence.now = "2026-09-11T01:03:11Z";
    evidence.second.revision = 2;
    expect(() => checkPrivateReview(evidence)).toThrow(/changed/);
  });
});
