import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { formatter } from "@lingui/format-po";
import { expect, it, vi } from "vitest";

import {
  acceptCrowdinAiCandidate,
  createCrowdinAiBaseline,
  planCrowdinAiRepeatExport,
  planCrowdinAiReset,
  stageCrowdinAiCandidate,
  verifyCrowdinAiReset,
} from "./crowdin-ai-cycle.mjs";
import { lingoJsonToPo } from "./lingo-json.mjs";

const sourcePath = "src/i18n/locales/en/messages.po";
const targetPath = "src/i18n/locales/zh-Hans/messages.po";
const po = formatter({ explicitIdAsDefault: true });
const blob = (value) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(value)}\0`)
    .update(value)
    .digest("hex");
const pinnedSourceHead = "96bbb4619507225bf663b44b221ded24b95f9777";
const gitOptions = { encoding: "utf8", cwd: new URL("../../", import.meta.url) };
const sourcePo = execFileSync("git", ["show", `${pinnedSourceHead}:${sourcePath}`], gitOptions);
const baselineTargetPo = execFileSync(
  "git",
  ["show", `${pinnedSourceHead}:${targetPath}`],
  gitOptions,
);
const source = po.parse(sourcePo);
const translations = Object.fromEntries(
  Object.entries(po.parse(baselineTargetPo)).map(([key, value]) => [
    key,
    value.translation || "翻译演练完成",
  ]),
);
translations["baseline.swap.review"] = "测试修订：查看兑换";
const exportedPo = lingoJsonToPo(sourcePo, translations, { expectedMessageCount: 13 }).replace(
  '"Language: zh-Hans\\n"',
  '"Language: zh-CN\\n"',
);
const manifest = {
  repository: "aidanaden/jupiter-i18n-translation-pilot",
  baseBranch: "aidan/provider-e2e-crowdin-ai-base",
  candidateBranch: "aidan/crowdin-ai-candidate-test-01",
  baseHead: "96bbb4619507225bf663b44b221ded24b95f9777",
  baseTreeOid: "e9a8e0ee7ef5636e6cc024526824ba24d7d9e8c3",
  pinnedSourceHead,
  projectSlug: "crowdin-ai-recording-02",
  projectId: 1234567,
  branchId: null,
  fileId: 123,
  sourceRevision: 1,
  sourceHash: "d04afe258a31159ff49d6f289142f0601fea4b5cf10bce21661eb008f945679e",
  providerLanguage: "zh-CN",
  repositoryLanguage: "zh-Hans",
  reviewerDisclosure: "Automated test reviewer. No human language review.",
};
const baselineInput = {
  manifest,
  current: {
    head: manifest.baseHead,
    sourcePo,
    targetPo: baselineTargetPo,
    tree: execFileSync("git", ["ls-tree", "-rz", manifest.pinnedSourceHead], {
      encoding: "utf8",
      cwd: new URL("../../", import.meta.url),
    })
      .split("\0")
      .filter(Boolean)
      .map((record) => {
        const split = record.indexOf("\t");
        const [mode, , oid] = record.slice(0, split).split(" ");
        return { path: record.slice(split + 1), mode, oid };
      }),
  },
};
const baseline = createCrowdinAiBaseline(baselineInput);
const evidence = {
  format: "normalized-review-snapshot-v1",
  ...Object.fromEntries(
    [
      "projectId",
      "projectSlug",
      "branchId",
      "fileId",
      "sourceRevision",
      "sourceHash",
      "providerLanguage",
    ].map((key) => [key, manifest[key]]),
  ),
  entries: Object.entries(translations).map(([messageId, translationText], index) => ({
    messageId,
    stringId: 100 + index,
    sourceText: source[messageId].translation,
    sourceRevision: 1,
    translationId: 200 + index,
    translationHash: createHash("sha256").update(translationText).digest("hex"),
    translationText,
    approvalId: 300 + index,
    approvedTranslationId: 200 + index,
    approvedTranslationHash: createHash("sha256").update(translationText).digest("hex"),
    approvedSourceRevision: 1,
    approvedText: translationText,
  })),
};
const stageInput = {
  baseline,
  expectedManifestDigest: baseline.manifestDigest,
  current: baseline.current,
  evidence,
  exportedPo,
};
const candidate = stageCrowdinAiCandidate(stageInput);
const acceptedHead = "2".repeat(40);
const acceptedCurrent = {
  ...baseline.current,
  head: acceptedHead,
  targetPo: candidate.candidatePo,
  tree: baseline.current.tree.map((entry) =>
    entry.path === targetPath ? { ...entry, oid: blob(candidate.candidatePo) } : entry,
  ),
};
const acceptInput = {
  candidate,
  expectedManifestDigest: baseline.manifestDigest,
  expectedCandidateDigest: candidate.digest,
  acceptedHead,
  current: acceptedCurrent,
};
const accepted = acceptCrowdinAiCandidate(acceptInput);
const acceptedInput = {
  accepted,
  expectedManifestDigest: baseline.manifestDigest,
  expectedAcceptedDigest: accepted.digest,
  expectedAcceptedHead: acceptedHead,
  current: acceptedCurrent,
};

it("moves the exact 13-message batch through candidate, accepted, repeat no-op and exact reset", () => {
  expect(baseline.phase).toBe("baseline");
  expect(candidate.phase).toBe("fully-approved-candidate");
  expect(Object.keys(po.parse(candidate.candidatePo))).toHaveLength(13);
  expect(po.parse(candidate.candidatePo)["baseline.swap.review"].translation).toBe(
    "测试修订：查看兑换",
  );
  expect(
    po.parse(
      po.serialize(po.parse(candidate.candidatePo), { locale: "zh-Hans", sourceLocale: "en" }),
    ),
  ).toEqual(po.parse(candidate.candidatePo));
  expect(accepted.phase).toBe("accepted");
  expect(planCrowdinAiRepeatExport({ ...acceptedInput, evidence, exportedPo })).toMatchObject({
    phase: "no-op",
    changedPaths: [],
  });
  expect(planCrowdinAiReset(acceptedInput)).toMatchObject({
    phase: "reset-plan",
    expectedHead: acceptedHead,
    baselineTargetPo,
    baselineTreeHash: baseline.hashes.tree,
    changedPaths: [targetPath],
  });
  expect(
    verifyCrowdinAiReset({
      before: acceptedInput,
      resetHead: "3".repeat(40),
      current: { ...baseline.current, head: "3".repeat(40) },
    }),
  ).toMatchObject({ phase: "reset", baselineTreeHash: baseline.hashes.tree });
});

it("freezes nested state without asserting live approval, deployment or human review", () => {
  for (const state of [baseline, candidate, accepted, planCrowdinAiReset(acceptedInput)]) {
    expect(Object.isFrozen(state)).toBe(true);
    expect(state).toMatchObject({
      evidence: "data-integrity-only",
      liveStateProved: false,
      humanApprovalProved: false,
      providerRequestAllowed: false,
      deliveryAllowed: false,
      mergeAllowed: false,
      deploymentAllowed: false,
    });
  }
  expect(Object.isFrozen(candidate.reviewEvidence.entries[0])).toBe(true);
  expect(Object.isFrozen(baseline.manifest)).toBe(true);
  expect(Object.isFrozen(baseline.current.tree[0])).toBe(true);
});

it("binds the complete repository tree to its real Git tree object ID", () => {
  expect(baseline.hashes.gitTree).toBe("e9a8e0ee7ef5636e6cc024526824ba24d7d9e8c3");
  const incomplete = structuredClone(baselineInput);
  incomplete.current.tree.shift();
  expect(() => createCrowdinAiBaseline(incomplete)).toThrow(/Complete baseline Git tree/);
  const changedOid = structuredClone(baselineInput);
  changedOid.manifest.baseTreeOid = "0".repeat(40);
  expect(() => createCrowdinAiBaseline(changedOid)).toThrow(/Complete baseline Git tree/);
});

it("permits an explicit setup baseline head while keeping the source fixed point", () => {
  const setup = structuredClone(baselineInput);
  setup.manifest.baseHead = "4".repeat(40);
  setup.current.head = setup.manifest.baseHead;
  expect(createCrowdinAiBaseline(setup).manifest.pinnedSourceHead).toBe(manifest.pinnedSourceHead);
  setup.manifest.pinnedSourceHead = "4".repeat(40);
  expect(() => createCrowdinAiBaseline(setup)).toThrow();
});

it("rejects nonexistent, obsolete, and malformed export messages", () => {
  const invalid = [
    exportedPo.replace('msgid "baseline.swap.review"', 'msgid "unknown.swap.review"'),
    exportedPo.replace('msgid "baseline.swap.review"', '#~ msgid "baseline.swap.review"'),
    "not a PO catalog",
  ];
  for (const value of invalid)
    expect(() => stageCrowdinAiCandidate({ ...stageInput, exportedPo: value })).toThrow();
});

it.each([
  [
    "repository",
    (p) => {
      p.manifest.repository = "someone/other";
    },
  ],
  [
    "main",
    (p) => {
      p.manifest.baseBranch = "main";
    },
  ],
  [
    "l10n",
    (p) => {
      p.manifest.baseBranch = "l10n";
    },
  ],
  [
    "candidate branch",
    (p) => {
      p.manifest.candidateBranch = "l10n";
    },
  ],
  [
    "candidate traversal",
    (p) => {
      p.manifest.candidateBranch += "/../main";
    },
  ],
  [
    "missing provider ID",
    (p) => {
      delete p.manifest.projectId;
    },
  ],
  [
    "original project",
    (p) => {
      p.manifest.projectId = 923331;
    },
  ],
  [
    "wrong provider slug",
    (p) => {
      p.manifest.projectSlug = "jupiter-i18n-translation-pilot";
    },
  ],
  [
    "missing file ID",
    (p) => {
      delete p.manifest.fileId;
    },
  ],
  [
    "unknown branch",
    (p) => {
      delete p.manifest.branchId;
    },
  ],
  [
    "zero revision",
    (p) => {
      p.manifest.sourceRevision = 0;
    },
  ],
  [
    "wrong language",
    (p) => {
      p.manifest.providerLanguage = "fr";
    },
  ],
  [
    "wrong base head",
    (p) => {
      p.manifest.baseHead = "4".repeat(40);
    },
  ],
  [
    "wrong current head",
    (p) => {
      p.current.head = "4".repeat(40);
    },
  ],
  [
    "source byte drift",
    (p) => {
      p.current.sourcePo += "\n";
    },
  ],
  [
    "target blob mismatch",
    (p) => {
      p.current.tree.find((entry) => entry.path === targetPath).oid = "b".repeat(40);
    },
  ],
  [
    "source symlink",
    (p) => {
      p.current.tree.find((entry) => entry.path === sourcePath).mode = "120000";
    },
  ],
  [
    "duplicate tree path",
    (p) => {
      p.current.tree.push(p.current.tree[0]);
    },
  ],
  [
    "unsafe tree path",
    (p) => {
      p.current.tree[0].path = "../package.json";
    },
  ],
  [
    "tree prefix conflict",
    (p) => {
      p.current.tree[0].path = "src";
    },
  ],
  [
    "false reviewer label",
    (p) => {
      p.manifest.reviewerDisclosure = "Human approved";
    },
  ],
])("refuses baseline %s", (_name, mutate) => {
  const input = structuredClone(baselineInput);
  mutate(input);
  expect(() => createCrowdinAiBaseline(input)).toThrow();
});

it.each([
  [
    "empty batch",
    (p) => {
      p.evidence.entries = [];
    },
  ],
  [
    "partial batch",
    (p) => {
      p.evidence.entries.pop();
    },
  ],
  [
    "missing approval",
    (p) => {
      delete p.evidence.entries[0].approvalId;
    },
  ],
  [
    "duplicate message",
    (p) => {
      p.evidence.entries[0].messageId = p.evidence.entries[1].messageId;
    },
  ],
  [
    "duplicate string",
    (p) => {
      p.evidence.entries[0].stringId = p.evidence.entries[1].stringId;
    },
  ],
  [
    "duplicate translation",
    (p) => {
      p.evidence.entries[0].translationId = p.evidence.entries[1].translationId;
    },
  ],
  [
    "duplicate approval",
    (p) => {
      p.evidence.entries[0].approvalId = p.evidence.entries[1].approvalId;
    },
  ],
  [
    "stale approval ID",
    (p) => {
      p.evidence.entries[0].approvedTranslationId += 1;
    },
  ],
  [
    "stale target revision",
    (p) => {
      p.evidence.entries[0].translationHash = "0".repeat(64);
    },
  ],
  [
    "stale source revision",
    (p) => {
      p.evidence.entries[0].sourceRevision += 1;
    },
  ],
  [
    "stale approved source",
    (p) => {
      p.evidence.entries[0].approvedSourceRevision += 1;
    },
  ],
  [
    "stale approved content",
    (p) => {
      p.evidence.entries[0].approvedText += " changed";
    },
  ],
  [
    "export differs",
    (p) => {
      p.exportedPo = p.exportedPo.replace("测试修订：查看兑换", "查看兑换");
    },
  ],
  [
    "source differs",
    (p) => {
      p.evidence.entries[0].sourceText += " changed";
    },
  ],
  [
    "provider project",
    (p) => {
      p.evidence.projectId += 1;
    },
  ],
  [
    "provider file",
    (p) => {
      p.evidence.fileId += 1;
    },
  ],
  [
    "provider branch",
    (p) => {
      p.evidence.branchId = 2;
    },
  ],
  [
    "provider revision",
    (p) => {
      p.evidence.sourceRevision += 1;
    },
  ],
  [
    "provider language",
    (p) => {
      p.evidence.providerLanguage = "fr";
    },
  ],
  [
    "export locale",
    (p) => {
      p.exportedPo = p.exportedPo.replace("Language: zh-CN", "Language: fr");
    },
  ],
  [
    "duplicate export ID",
    (p) => {
      p.exportedPo += '\nmsgid "baseline.swap.review"\nmsgstr "查看兑换"\n';
    },
  ],
  [
    "expected manifest",
    (p) => {
      p.expectedManifestDigest = "0".repeat(64);
    },
  ],
  [
    "forged baseline",
    (p) => {
      p.baseline.hashes.target = "0".repeat(64);
    },
  ],
  [
    "changed baseline head",
    (p) => {
      p.current.head = "4".repeat(40);
    },
  ],
  [
    "unrelated path edit",
    (p) => {
      p.current.tree[0].oid = "b".repeat(40);
    },
  ],
  [
    "extra source change",
    (p) => {
      p.current.sourcePo += "\n";
    },
  ],
  [
    "extra target change",
    (p) => {
      p.current.targetPo += "\n";
    },
  ],
  [
    "unknown permission",
    (p) => {
      p.approved = true;
    },
  ],
])("refuses candidate %s", (_name, mutate) => {
  const input = structuredClone(stageInput);
  mutate(input);
  expect(() => stageCrowdinAiCandidate(input)).toThrow();
});

it.each([
  ["argument", "baseline.onboard.title", (text) => text.replace("{jupiter}", "Jupiter")],
  [
    "select",
    "sandbox.onboard.wallet-state",
    (text) => text.replace("walletState", "differentState"),
  ],
  ["plural", "sandbox.swap.market-count", (text) => text.replace("routeCount", "differentCount")],
  ["rich tag", "sandbox.translation.guide", (text) => text.replaceAll("link>", "strong>")],
  ["empty target", "baseline.swap.review", () => " "],
])("refuses reviewed placeholder or content drift: %s", (_name, messageId, mutate) => {
  const input = structuredClone(stageInput);
  const entry = input.evidence.entries.find((item) => item.messageId === messageId);
  entry.translationText = mutate(entry.translationText);
  entry.approvedText = entry.translationText;
  entry.translationHash = createHash("sha256").update(entry.translationText).digest("hex");
  entry.approvedTranslationHash = entry.translationHash;
  const catalog = po.parse(input.exportedPo);
  catalog[messageId].translation = entry.translationText;
  input.exportedPo = po.serialize(catalog, { locale: "zh-Hans", sourceLocale: "en" });
  expect(() => stageCrowdinAiCandidate(input)).toThrow();
});

it.each([
  [
    "wrong expected candidate",
    (p) => {
      p.expectedCandidateDigest = "0".repeat(64);
    },
  ],
  [
    "wrong expected manifest",
    (p) => {
      p.expectedManifestDigest = "0".repeat(64);
    },
  ],
  [
    "same accepted head",
    (p) => {
      p.acceptedHead = manifest.baseHead;
      p.current.head = manifest.baseHead;
    },
  ],
  [
    "wrong accepted head",
    (p) => {
      p.current.head = "4".repeat(40);
    },
  ],
  [
    "wrong candidate bytes",
    (p) => {
      p.candidate.candidatePo += "\n";
    },
  ],
  [
    "wrong phase",
    (p) => {
      p.candidate.phase = "baseline";
    },
  ],
  [
    "unrelated changed path",
    (p) => {
      p.current.tree[0].oid = "b".repeat(40);
    },
  ],
  [
    "deleted path",
    (p) => {
      p.current.tree.shift();
    },
  ],
])("refuses accepted %s", (_name, mutate) => {
  const input = structuredClone(acceptInput);
  mutate(input);
  expect(() => acceptCrowdinAiCandidate(input)).toThrow();
});

it.each([
  [
    "current head",
    (p) => {
      p.current.head = "4".repeat(40);
    },
  ],
  [
    "expected accepted head",
    (p) => {
      p.expectedAcceptedHead = "4".repeat(40);
    },
  ],
  [
    "expected digest",
    (p) => {
      p.expectedAcceptedDigest = "0".repeat(64);
    },
  ],
  [
    "accepted tree hash",
    (p) => {
      p.accepted.acceptedTreeHash = "0".repeat(64);
    },
  ],
  [
    "source bytes",
    (p) => {
      p.current.sourcePo += "\n";
    },
  ],
  [
    "target bytes",
    (p) => {
      p.current.targetPo += "\n";
    },
  ],
  [
    "unrelated path",
    (p) => {
      p.current.tree[0].oid = "b".repeat(40);
    },
  ],
  [
    "added path",
    (p) => {
      p.current.tree.push({ path: "new.txt", mode: "100644", oid: "a".repeat(40) });
    },
  ],
])("refuses repeat export and reset with drift in %s", (_name, mutate) => {
  const input = structuredClone(acceptedInput);
  mutate(input);
  expect(() => planCrowdinAiReset(input)).toThrow();
  expect(() => planCrowdinAiRepeatExport({ ...input, evidence, exportedPo })).toThrow();
});

it("rejects an apparently approved export that removes the accepted correction", () => {
  const input = structuredClone({ ...acceptedInput, evidence, exportedPo });
  const row = input.evidence.entries.find((entry) => entry.messageId === "baseline.swap.review");
  row.translationText = "查看兑换";
  row.approvedText = "查看兑换";
  row.translationHash = createHash("sha256").update(row.translationText).digest("hex");
  row.approvedTranslationHash = row.translationHash;
  input.exportedPo = input.exportedPo.replace("测试修订：查看兑换", "查看兑换");
  expect(() => planCrowdinAiRepeatExport(input)).toThrow(/Accepted correction/);
});

it("rejects reset drift, reused heads and a catalog that is not the exact baseline", () => {
  const input = {
    before: acceptedInput,
    resetHead: "3".repeat(40),
    current: { ...baseline.current, head: "3".repeat(40) },
  };
  for (const resetHead of [manifest.baseHead, acceptedHead])
    expect(() => verifyCrowdinAiReset({ ...input, resetHead })).toThrow();
  expect(() =>
    verifyCrowdinAiReset({
      ...input,
      current: { ...input.current, targetPo: candidate.candidatePo },
    }),
  ).toThrow();
  const changed = structuredClone(input);
  changed.current.tree[0].oid = "b".repeat(40);
  expect(() => verifyCrowdinAiReset(changed)).toThrow();
});

it("never calls a provider or changes input during repeat export and reset", () => {
  const fetch = vi.fn(() => {
    throw new Error("No network allowed");
  });
  vi.stubGlobal("fetch", fetch);
  try {
    const before = JSON.stringify(acceptedInput);
    const first = planCrowdinAiRepeatExport({ ...acceptedInput, evidence, exportedPo });
    expect(planCrowdinAiRepeatExport({ ...acceptedInput, evidence, exportedPo })).toEqual(first);
    planCrowdinAiReset(acceptedInput);
    expect(JSON.stringify(acceptedInput)).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
