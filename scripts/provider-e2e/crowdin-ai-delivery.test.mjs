import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, it } from "vitest";
import { parse } from "yaml";

import { verifyCrowdinAiDelivery } from "./crowdin-ai-delivery.mjs";
import {
  createCrowdinAiStatus,
  deliveryScope,
  validateCrowdinPush,
} from "./crowdin-ai-delivery-status.mjs";
import { nativeScope } from "./crowdin-ai-native-read.mjs";
import { lingoJsonToPo } from "./lingo-json.mjs";

const baseHead = deliveryScope.baseSha;
const trustedTaskHead = "5".repeat(40);
const sourcePath = "src/i18n/locales/en/messages.po";
const targetPath = "src/i18n/locales/zh-Hans/messages.po";
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", cwd: new URL("../../", import.meta.url) });
const sourcePo = git("show", `${baseHead}:${sourcePath}`);
const baselineTargetPo = git("show", `${baseHead}:${targetPath}`);
const captureText = git("show", `${baseHead}:scripts/provider-e2e/crowdin-ai-review-capture.json`);
const capture = JSON.parse(captureText);
const snapshot = capture.preReviewSnapshot;
const translated = Object.fromEntries(
  capture.entries.map((entry) => [entry.messageId, entry.translationText]),
);
const targetPo = lingoJsonToPo(sourcePo, translated, { expectedMessageCount: 13 });
const tree = git("ls-tree", "-rz", baseHead)
  .split("\0")
  .filter(Boolean)
  .map((record) => {
    const [details, path] = record.split("\t");
    const [mode, , oid] = details.split(" ");
    return { path, mode, oid };
  });
const headSha = deliveryScope.headSha;
const branch = deliveryScope.headBranch;
const nativeSnapshot = {
  ...snapshot,
  startedAt: "2026-09-09T00:05:00Z",
  completedAt: "2026-09-09T00:05:10Z",
  approvals: snapshot.translations.map((item, index) => ({
    id: index + 201,
    translationId: item.translationId,
    stringId: item.stringId,
    languageId: "zh-CN",
    userId: capture.reviewerUserId,
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
  number: deliveryScope.number,
  state: "open",
  draft: false,
  head: ref,
  base: { ...ref, ref: "aidan/provider-e2e-crowdin-ai-base", sha: baseHead },
};
const input = {
  event: {
    repository: { full_name: nativeScope.repository },
    ref: deliveryScope.taskRef,
    after: trustedTaskHead,
    before: baseHead,
    deleted: false,
    forced: false,
    head_commit: { id: trustedTaskHead },
  },
  currentPr: structuredClone(pr),
  trustedHead: trustedTaskHead,
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
  captureText,
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

it("pins the integrated repair base and candidate without changing source, target or saved capture", () => {
  expect(deliveryScope.baseSha).toBe("2e476be7ab29563470a358d8a1ddbffe05034f17");
  expect(deliveryScope.headSha).toBe("148bcfc4cae92ab35563164de59b382c75384803");
  expect(sourcePo).toBe(git("show", `e317c1d76b0a813954c0f46063047f8f15f1942c:${sourcePath}`));
  expect(captureText).toBe(
    git(
      "show",
      "e317c1d76b0a813954c0f46063047f8f15f1942c:scripts/provider-e2e/crowdin-ai-review-capture.json",
    ),
  );
  expect(git("show", `${headSha}:${targetPath}`)).toBe(
    git("show", `3f951a5975d9a8d4d59fa747b1cd87bfab022033:${targetPath}`),
  );
  const old = structuredClone(input);
  old.currentPr.base.sha = "e317c1d76b0a813954c0f46063047f8f15f1942c";
  old.currentPr.head.sha = "3f951a5975d9a8d4d59fa747b1cd87bfab022033";
  expect(() => verifyCrowdinAiDelivery(old)).toThrow();
});

it("accepts the push event shape only on the trusted task ref", () => {
  expect(() => validateCrowdinPush(input.event, trustedTaskHead)).not.toThrow();
  expect(trustedTaskHead).not.toBe(baseHead);
  for (const mutation of [
    (event) => {
      event.ref = "refs/heads/main";
    },
    (event) => {
      event.ref = `refs/heads/${deliveryScope.headBranch}`;
    },
    (event) => {
      event.deleted = true;
    },
    (event) => {
      event.forced = true;
    },
    (event) => {
      delete event.forced;
    },
    (event) => {
      event.head_commit.id = "4".repeat(40);
    },
    (event) => {
      event.after = "malformed";
    },
    (event) => {
      event.repository.full_name = "other/repo";
    },
  ]) {
    const event = structuredClone(input.event);
    mutation(event);
    expect(() => validateCrowdinPush(event, trustedTaskHead)).toThrow();
    expect(() => verifyCrowdinAiDelivery({ ...input, event })).toThrow();
  }
  expect(() => validateCrowdinPush(input.event, baseHead)).toThrow();
});

it("rejects capture bytes that do not come from the pinned base blob", () => {
  expect(() => verifyCrowdinAiDelivery({ ...input, captureText: `${captureText}\n` })).toThrow(
    /pinned base blob/,
  );
  const altered = JSON.parse(captureText);
  altered.reviewerUserId = 42;
  expect(() =>
    verifyCrowdinAiDelivery({ ...input, captureText: JSON.stringify(altered) }),
  ).toThrow();
  const code = readFileSync(new URL("./crowdin-ai-delivery.mjs", import.meta.url), "utf8");
  for (const path of ["sourcePath", "targetPath", "capturePath"]) {
    expect(code).toContain('git("show", `${deliveryScope.baseSha}:${' + path + "}`)");
  }
  expect(code).not.toContain("readBounded(capturePath)");
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
      delete p.captureText;
    },
  ],
])("refuses %s", (_label, change) => {
  const value = structuredClone(input);
  change(value);
  expect(() => verifyCrowdinAiDelivery(value)).toThrow();
});

it("uses only trusted task code with the Crowdin read token", () => {
  const workflow = parse(
    readFileSync(
      new URL("../../.github/workflows/crowdin-ai-delivery.yml", import.meta.url),
      "utf8",
    ),
  );
  expect(workflow.name).toBe("crowdin-ai-delivery");
  expect(workflow.on).toEqual({ push: { branches: ["aidan/crowdin-ai-recording-02"] } });
  expect(workflow.permissions).toEqual({ contents: "read", "pull-requests": "read" });
  const steps = workflow.jobs["crowdin-ai-delivery"].steps;
  const checkouts = steps.filter((step) => step.uses?.startsWith("actions/checkout@"));
  expect(checkouts).toHaveLength(1);
  expect(checkouts[0].with).toMatchObject({
    ref: "${{ github.sha }}",
    "fetch-depth": 0,
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
    trustedHead: trustedTaskHead,
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
  const wrongNumber = structuredClone(status);
  wrongNumber.currentPr.number = 27;
  expect(createCrowdinAiStatus(wrongNumber).body.state).toBe("failure");
  expect(() => verifyCrowdinAiDelivery({ ...input, currentPr: wrongNumber.currentPr })).toThrow();
  const foreign = structuredClone(status);
  foreign.event.repository.full_name = "other/repo";
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
