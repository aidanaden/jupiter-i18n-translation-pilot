import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatter } from "@lingui/format-po";
import { afterEach, expect, it, vi } from "vitest";

import { runAppCycleCli } from "./app-cycle-cli.mjs";
import { createAppCycleSnapshot, planAppCycleReset, planAppCycleSync } from "./app-cycle.mjs";
import { lingoJsonToPo } from "./lingo-json.mjs";

const targetPath = "src/i18n/locales/zh-Hans/messages.po";
const directories = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function fixture() {
  const [sourcePo, baselineTargetPo] = ["en", "zh-Hans"].map((locale) =>
    execFileSync(
      "git",
      ["show", `ed5dc31e70930c8bdb7d3675d208dd99395647d2:src/i18n/locales/${locale}/messages.po`],
      {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8",
      },
    ),
  );
  const target = Object.fromEntries(
    Object.entries(formatter({ explicitIdAsDefault: true }).parse(baselineTargetPo)).map(
      ([id, entry]) => [id, entry.translation || "翻译演练完成"],
    ),
  );
  target["baseline.swap.review"] = "测试修订：查看兑换";
  const input = {
    repository: "aidanaden/jupiter-i18n-translation-pilot",
    baseBranch: "aidan/provider-e2e-lingo-base",
    runId: "test-cycle-01",
    attempt: 1,
    sourceSha: "1".repeat(40),
    baseSha: "2".repeat(40),
    acceptedSha: "3".repeat(40),
    sourcePo,
    baselineTargetPo,
    acceptedTargetPo: lingoJsonToPo(sourcePo, target, { expectedMessageCount: 13 }),
  };
  const snapshot = createAppCycleSnapshot(input);
  const {
    sourcePo: _source,
    baselineTargetPo: _baseline,
    acceptedTargetPo: _accepted,
    ...refs
  } = input;
  return {
    input,
    plan: {
      snapshot,
      expected: { ...refs, digest: snapshot.digest },
      current: {
        head: input.acceptedSha,
        sourcePo,
        targetPo: input.acceptedTargetPo,
        changedPaths: [targetPath],
      },
    },
  };
}

it("keeps exact bytes and immutable hashes without claiming human or live-state proof", async () => {
  const { input, plan } = await fixture();
  expect(plan.snapshot.sourcePo).toBe(input.sourcePo);
  expect(plan.snapshot.baselineTargetPo).toBe(input.baselineTargetPo);
  expect(plan.snapshot.acceptedTargetPo).toBe(input.acceptedTargetPo);
  expect(Object.isFrozen(plan.snapshot)).toBe(true);
  expect(Object.isFrozen(plan.snapshot.hashes)).toBe(true);
  expect(plan.snapshot).toMatchObject({
    evidence: "data-integrity-only",
    humanApprovalProved: false,
    liveStateProved: false,
    providerRequestAllowed: false,
    mergeAllowed: false,
    deploymentAllowed: false,
  });
});

it("performs repeated no-op sync with no provider request and no correction change", async () => {
  const fetch = vi.fn(() => {
    throw new Error("No network request allowed");
  });
  vi.stubGlobal("fetch", fetch);
  const { plan } = await fixture();
  const before = JSON.stringify(plan);
  const result = planAppCycleSync(plan);
  expect(planAppCycleSync(plan)).toEqual(result);
  expect(result).toMatchObject({ status: "no-op", changedPaths: [], targetPreserved: true });
  expect(JSON.stringify(plan)).toBe(before);
  expect(fetch).not.toHaveBeenCalled();
});

it("requires new review for proposed source change while preserving the accepted target", async () => {
  const { plan } = await fixture();
  const nextSourcePo = plan.current.sourcePo.replace('msgstr "Review swap"', 'msgstr "Check swap"');
  expect(nextSourcePo).not.toBe(plan.current.sourcePo);
  expect(planAppCycleSync({ ...plan, nextSourcePo })).toMatchObject({
    status: "review-required",
    targetPreserved: true,
    changedPaths: [],
    providerRequestAllowed: false,
  });
  expect(planAppCycleSync({ ...plan, nextSourcePo: plan.current.sourcePo }).status).toBe("no-op");
  expect(() => planAppCycleSync({ ...plan, nextSourcePo: "invalid" })).toThrow();
});

it("prepares only the original exact Chinese PO for a protected reset PR", async () => {
  const { input, plan } = await fixture();
  const result = planAppCycleReset(plan);
  expect(result).toMatchObject({
    status: "protected-reset-pr-required",
    expectedHead: input.acceptedSha,
    changedPaths: [targetPath],
    baselineTargetPo: input.baselineTargetPo,
    mergeAllowed: false,
    deploymentAllowed: false,
  });
  expect(Object.isFrozen(result.changedPaths)).toBe(true);
});

it.each([
  [
    "repository",
    (p) => {
      p.expected.repository = "someone/other";
    },
  ],
  [
    "base branch",
    (p) => {
      p.expected.baseBranch = "main";
    },
  ],
  [
    "run",
    (p) => {
      p.expected.runId = "another-run";
    },
  ],
  [
    "attempt",
    (p) => {
      p.expected.attempt = 2;
    },
  ],
  [
    "digest",
    (p) => {
      p.expected.digest = "a".repeat(64);
    },
  ],
  [
    "source ref",
    (p) => {
      p.expected.sourceSha = "4".repeat(40);
    },
  ],
  [
    "base ref",
    (p) => {
      p.expected.baseSha = "4".repeat(40);
    },
  ],
  [
    "accepted ref",
    (p) => {
      p.expected.acceptedSha = "4".repeat(40);
    },
  ],
  [
    "current head",
    (p) => {
      p.current.head = "4".repeat(40);
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
      p.current.changedPaths.push("package.json");
    },
  ],
  [
    "missing path",
    (p) => {
      p.current.changedPaths = [];
    },
  ],
  [
    "snapshot bytes",
    (p) => {
      p.snapshot.baselineTargetPo += "\n";
    },
  ],
  [
    "snapshot hash",
    (p) => {
      p.snapshot.hashes.sourcePo = "a".repeat(64);
    },
  ],
  [
    "snapshot authority",
    (p) => {
      p.snapshot.humanApprovalProved = true;
    },
  ],
  [
    "unknown input",
    (p) => {
      p.approved = true;
    },
  ],
])("rejects changed %s before sync or reset", async (_name, mutate) => {
  const { plan } = await fixture();
  const changed = structuredClone(plan);
  mutate(changed);
  expect(() => planAppCycleSync(changed)).toThrow();
  expect(() => planAppCycleReset(changed)).toThrow();
});

it("rejects absent change, bad accepted placeholders, and proposed source input during reset", async () => {
  const { input, plan } = await fixture();
  expect(() => createAppCycleSnapshot({ ...input, acceptedSha: input.baseSha })).toThrow();
  expect(() =>
    createAppCycleSnapshot({
      ...input,
      acceptedTargetPo: input.acceptedTargetPo.replace("{jupiter}", "Jupiter"),
    }),
  ).toThrow();
  expect(() => planAppCycleReset({ ...plan, nextSourcePo: input.sourcePo })).toThrow();
});

it("writes new private artifacts and exact reset bytes without changing any input file", async () => {
  const { input, plan } = await fixture();
  const scratch = await mkdtemp(join(tmpdir(), "jupiter-cycle-test-"));
  directories.push(scratch);
  const inputPath = join(scratch, "input.json");
  const planPath = join(scratch, "plan.json");
  const inputBytes = JSON.stringify(input);
  const planBytes = JSON.stringify(plan);
  await writeFile(inputPath, inputBytes, { flag: "wx", mode: 0o600 });
  await writeFile(planPath, planBytes, { flag: "wx", mode: 0o600 });
  for (const command of ["snapshot", "sync", "reset", "reset"]) {
    const output = await runAppCycleCli([command, command === "snapshot" ? inputPath : planPath]);
    expect(directories).not.toContain(output.directory);
    directories.push(output.directory);
    expect((await stat(output.directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(output.directory, `${command}.json`))).mode & 0o777).toBe(0o600);
    if (command === "reset") {
      const bytes = await readFile(join(output.directory, "baseline-target.po"));
      expect(bytes).toEqual(Buffer.from(input.baselineTargetPo));
      expect((await stat(join(output.directory, "baseline-target.po"))).mode & 0o777).toBe(0o600);
    }
  }
  expect(await readFile(inputPath, "utf8")).toBe(inputBytes);
  expect(await readFile(planPath, "utf8")).toBe(planBytes);
  await expect(runAppCycleCli(["reset", planPath, inputPath])).rejects.toThrow();
  await expect(runAppCycleCli(["deploy", planPath])).rejects.toThrow();
});
