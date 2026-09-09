import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { formatter } from "@lingui/format-po";
import { expect, it } from "vitest";
import { parse } from "yaml";

import { verifyCrowdinAiDelivery } from "./crowdin-ai-delivery.mjs";
import { createCrowdinAiStatus } from "./crowdin-ai-delivery-status.mjs";
import { nativeScope } from "./crowdin-ai-native-read.mjs";
import { captureCrowdinAiReview } from "./crowdin-ai-review-evidence.mjs";
import { lingoJsonToPo } from "./lingo-json.mjs";

const baseHead = "96bbb4619507225bf663b44b221ded24b95f9777";
const sourcePath = "src/i18n/locales/en/messages.po";
const targetPath = "src/i18n/locales/zh-Hans/messages.po";
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", cwd: new URL("../../", import.meta.url) });
const sourcePo = git("show", `${baseHead}:${sourcePath}`);
const baselineTargetPo = git("show", `${baseHead}:${targetPath}`);
const po = formatter({ explicitIdAsDefault: true });
const source = po.parse(sourcePo);
const translated = Object.fromEntries(
  Object.entries(po.parse(baselineTargetPo)).map(([key, value]) => [
    key,
    value.translation || "翻译演练完成",
  ]),
);
translated["baseline.swap.review"] = "测试修订：查看兑换";
const targetPo = po.serialize(
  po.parse(lingoJsonToPo(sourcePo, translated, { expectedMessageCount: 13 })),
  { locale: "zh-Hans", sourceLocale: "en", existing: baselineTargetPo },
);
const tree = git("ls-tree", "-rz", baseHead)
  .split("\0")
  .filter(Boolean)
  .map((record) => {
    const [details, path] = record.split("\t");
    const [mode, , oid] = details.split(" ");
    return { path, mode, oid };
  });
const headSha = "2".repeat(40);
const branch = "aidan/crowdin-ai-candidate-test-01";
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
  strings: Object.entries(source).map(([identifier, entry], index) => ({
    id: index + 1,
    projectId: 927431,
    fileId: 14,
    identifier,
    text: entry.translation,
    context: "context",
    revision: 1,
    createdAt: "2026-09-09T00:00:00Z",
    updatedAt: null,
  })),
  translations: Object.keys(source).map((key, index) => ({
    stringId: index + 1,
    contentType: "text/plain",
    translationId: index + 101,
    text: translated[key],
    userId: 99,
    createdAt: "2026-09-09T00:00:00Z",
  })),
  approvals: [],
  requests: [
    {
      path: "/projects/927431/strings?fileId=14&limit=100&offset=0",
      receivedAt: "2026-09-09T00:01:05Z",
    },
  ],
};
const capture = captureCrowdinAiReview({
  nativeSnapshot: snapshot,
  sourcePo,
  reviewerUserId: 42,
  capturedAt: "2026-09-09T00:01:15Z",
  reviewerDisclosure: "Automated test reviewer. No human language review.",
});
const nativeSnapshot = {
  ...snapshot,
  startedAt: "2026-09-09T00:05:00Z",
  completedAt: "2026-09-09T00:05:10Z",
  approvals: snapshot.translations.map((item, index) => ({
    id: index + 201,
    translationId: item.translationId,
    stringId: item.stringId,
    languageId: "zh-CN",
    userId: 42,
    createdAt: "2026-09-09T00:03:00Z",
  })),
  requests: [
    {
      path: "/projects/927431/approvals?languageId=zh-CN&fileId=14&limit=100&offset=0",
      receivedAt: "2026-09-09T00:05:05Z",
    },
  ],
};
const ref = { ref: branch, sha: headSha, repo: { full_name: nativeScope.repository } };
const pr = {
  number: 31,
  state: "open",
  draft: false,
  head: ref,
  base: { ...ref, ref: "aidan/provider-e2e-crowdin-ai-base", sha: baseHead },
};
const input = {
  event: { repository: { full_name: nativeScope.repository }, number: 31, pull_request: pr },
  currentPr: structuredClone(pr),
  trustedHead: baseHead,
  mergeBase: baseHead,
  baseTreeOid: git("rev-parse", `${baseHead}^{tree}`).trim(),
  sourcePo,
  baselineTargetPo,
  baseTree: tree,
  candidateTree: tree.map((entry) =>
    entry.path === targetPath
      ? {
          ...entry,
          oid: createHash("sha1")
            .update(`blob ${Buffer.byteLength(targetPo)}\0`)
            .update(targetPo)
            .digest("hex"),
        }
      : entry,
  ),
  targetPo,
  capture,
  nativeSnapshot,
  now: "2026-09-09T00:06:00Z",
};

it("passes an exact 13-message candidate bound to current native approval records", () => {
  expect(verifyCrowdinAiDelivery(input)).toMatchObject({
    status: "candidate-verified",
    headSha,
    baseSha: baseHead,
    captureDigest: capture.digest,
    humanApprovalProved: false,
    approvalTimeContentProved: false,
    mergeAllowed: false,
    deploymentAllowed: false,
  });
});

it.each([
  [
    "unapproved batch",
    (p) => {
      p.nativeSnapshot.approvals = [];
    },
  ],
  [
    "partial approval",
    (p) => {
      p.nativeSnapshot.approvals.pop();
    },
  ],
  [
    "wrong reviewer",
    (p) => {
      p.nativeSnapshot.approvals[0].userId = 43;
    },
  ],
  [
    "stale translation",
    (p) => {
      p.nativeSnapshot.translations[0].text += "changed";
    },
  ],
  [
    "changed source",
    (p) => {
      p.nativeSnapshot.strings[0].text += "changed";
    },
  ],
  [
    "stale approval",
    (p) => {
      p.nativeSnapshot.approvals[0].translationId = 999;
    },
  ],
  [
    "wrong project",
    (p) => {
      p.nativeSnapshot.scope.projectId = 923331;
    },
  ],
  [
    "stale read",
    (p) => {
      p.now = "2026-09-09T00:12:00Z";
    },
  ],
  [
    "future read",
    (p) => {
      p.now = "2026-09-09T00:04:00Z";
    },
  ],
  [
    "wrong repository",
    (p) => {
      p.event.repository.full_name = "other/repo";
    },
  ],
  [
    "fork",
    (p) => {
      p.currentPr.head.repo.full_name = "other/repo";
    },
  ],
  [
    "main base",
    (p) => {
      p.currentPr.base.ref = "main";
    },
  ],
  [
    "l10n candidate",
    (p) => {
      p.currentPr.head.ref = "l10n";
    },
  ],
  [
    "wrong head",
    (p) => {
      p.currentPr.head.sha = "4".repeat(40);
    },
  ],
  [
    "wrong checkout",
    (p) => {
      p.trustedHead = "4".repeat(40);
    },
  ],
  [
    "wrong ancestry",
    (p) => {
      p.mergeBase = "4".repeat(40);
    },
  ],
  [
    "draft",
    (p) => {
      p.currentPr.draft = true;
    },
  ],
  [
    "closed",
    (p) => {
      p.currentPr.state = "closed";
    },
  ],
  [
    "extra path edit",
    (p) => {
      p.candidateTree[0].oid = "a".repeat(40);
    },
  ],
  [
    "extra path",
    (p) => {
      p.candidateTree.push({ path: "extra.txt", mode: "100644", oid: "a".repeat(40) });
    },
  ],
  [
    "removed path",
    (p) => {
      p.candidateTree.shift();
    },
  ],
  [
    "payload differs",
    (p) => {
      p.targetPo += "\n";
    },
  ],
  [
    "missing capture",
    (p) => {
      delete p.capture;
    },
  ],
])("refuses %s", (_label, change) => {
  const value = structuredClone(input);
  change(value);
  expect(() => verifyCrowdinAiDelivery(value)).toThrow();
});

it("uses only trusted base code with the Crowdin read token", () => {
  const workflow = parse(
    readFileSync(
      new URL("../../.github/workflows/crowdin-ai-delivery.yml", import.meta.url),
      "utf8",
    ),
  );
  expect(workflow.name).toBe("crowdin-ai-delivery");
  expect(workflow.on.pull_request_target.branches).toEqual(["aidan/provider-e2e-crowdin-ai-base"]);
  expect(workflow.permissions).toEqual({ contents: "read", "pull-requests": "read" });
  const steps = workflow.jobs["crowdin-ai-delivery"].steps;
  const checkouts = steps.filter((step) => step.uses?.startsWith("actions/checkout@"));
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].with).toMatchObject({
    ref: "${{ github.event.pull_request.base.sha }}",
    "persist-credentials": false,
  });
  expect(
    steps.filter((step) => JSON.stringify(step).includes("CROWDIN_AI_RECORDING_TOKEN")),
  ).toHaveLength(1);
  const secretStep = steps.find((step) => step.env?.CROWDIN_PERSONAL_TOKEN);
  expect(secretStep.run).toBe(
    'node scripts/provider-e2e/crowdin-ai-native-read.mjs "$RUNNER_TEMP/crowdin-ai-delivery-native"',
  );
  expect(steps.some((step) => step.run === "pnpm install --frozen-lockfile --ignore-scripts")).toBe(
    true,
  );
  expect(JSON.stringify(steps)).not.toContain("pull_request.head.sha");
  expect(workflow.jobs["crowdin-ai-delivery"].permissions).toBeUndefined();
  for (const name of ["pending", "publish-status"]) {
    expect(workflow.jobs[name].permissions.statuses).toBe("write");
    expect(JSON.stringify(workflow.jobs[name])).not.toContain("CROWDIN_AI_RECORDING_TOKEN");
  }
  expect(workflow.jobs["publish-status"].if).toContain("always()");
});

it("posts status only for the triggered head and rejects a stale success", () => {
  const status = {
    event: input.event,
    currentPr: input.currentPr,
    trustedHead: baseHead,
    mode: "complete",
    verifyResult: "success",
    pendingResult: "success",
    runId: "12345",
  };
  expect(createCrowdinAiStatus(status)).toMatchObject({
    path: `/repos/${nativeScope.repository}/statuses/${headSha}`,
    body: { state: "success", context: "crowdin-ai-delivery" },
  });
  expect(createCrowdinAiStatus({ ...status, mode: "pending" }).body.state).toBe("pending");
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    expect(createCrowdinAiStatus({ ...status, verifyResult: result }).body.state).toBe("failure");
    expect(createCrowdinAiStatus({ ...status, pendingResult: result }).body.state).toBe("failure");
  }
  const changed = structuredClone(status);
  changed.currentPr.head.sha = "3".repeat(40);
  expect(createCrowdinAiStatus(changed)).toMatchObject({
    path: `/repos/${nativeScope.repository}/statuses/${headSha}`,
    body: { state: "failure" },
  });
  changed.currentPr = undefined;
  expect(createCrowdinAiStatus(changed).body.state).toBe("failure");
  const changedBase = structuredClone(status);
  changedBase.currentPr.base.sha = "3".repeat(40);
  expect(createCrowdinAiStatus(changedBase).body.state).toBe("failure");
  const foreign = structuredClone(status);
  foreign.event.pull_request.head.repo.full_name = "other/repo";
  expect(() => createCrowdinAiStatus(foreign)).toThrow();
  expect(() => createCrowdinAiStatus({ ...status, trustedHead: "3".repeat(40) })).toThrow();
});

it("keeps old CI behavior outside the exact Crowdin AI base", () => {
  const workflow = parse(
    readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );
  const steps = workflow.jobs.verify.steps;
  expect(steps.find((step) => step.run === "pnpm run build").if).toBe(
    "github.event_name == 'pull_request' && github.base_ref == 'aidan/provider-e2e-crowdin-ai-base'",
  );
  for (const run of [
    "verify:ssr",
    "verify:rehearsal-reset-plan",
    "verify:rehearsal-reset-execution",
    "verify:rehearsal-translated",
    "deploy:dry-run",
  ]) {
    expect(steps.find((step) => step.run === `pnpm run ${run}`).if).toBe(
      "github.event_name != 'pull_request' || (github.base_ref != 'aidan/provider-e2e-lingo-base' && github.base_ref != 'aidan/provider-e2e-crowdin-ai-base')",
    );
  }
  for (const run of ["verify:ssr:lingo-e2e", "verify:lingo-e2e:dry-run"]) {
    expect(steps.find((step) => step.run === `pnpm run ${run}`).if).toBe(
      "github.event_name == 'pull_request' && github.base_ref == 'aidan/provider-e2e-lingo-base'",
    );
  }
});
