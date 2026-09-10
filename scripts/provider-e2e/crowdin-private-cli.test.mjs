import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";
import { parse } from "yaml";

import { runPrivatePreparation } from "./crowdin-private-cli.mjs";

const sha = "a".repeat(40);
const base = "e03b669d78b0e4704cb7640c2e1531867f47a835";
function nativeApi() {
  const labels = [
    ["balance", "Balance {balance}", "余额 {balance}"],
    ["limit", "Limit", "限价"],
    ["market", "Market", "市价"],
    ["pay", "You pay", "您支付"],
    ["receive", "You receive", "您将收到"],
    ["recurring", "Recurring", "定期"],
  ];
  const source = labels.map(([key, text], index) => ({
    id: index + 1,
    projectId: 929237,
    fileId: 36,
    identifier: `swap.form.${key}`,
    text,
    createdAt: "2026-09-11T01:00:00Z",
    updatedAt: null,
  }));
  for (let index = 0; index < 13; index += 1)
    source.push({ ...source[0], id: 100 + index, identifier: `existing.${index}` });
  return async (url) => {
    const path = new URL(url).pathname;
    let data;
    if (path.endsWith("/929237"))
      data = {
        id: 929237,
        identifier: "jupiter-ai-private-20260911",
        visibility: "private",
        sourceLanguageId: "en",
        targetLanguageIds: ["zh-CN"],
      };
    else if (path.endsWith("/files/36"))
      data = {
        id: 36,
        projectId: 929237,
        name: "messages.po",
        revisionId: 1,
        branchId: 26,
        directoryId: 4,
      };
    else if (path.endsWith("/branches/26"))
      data = { id: 26, name: "aidan.crowdin-private-recording-base-20260911" };
    else if (path.includes("/directories/")) {
      const id = Number(path.split("/").at(-1));
      data = {
        id,
        name: ["src", "i18n", "locales", "en"][id - 1],
        branchId: 26,
        directoryId: id - 1 || null,
      };
    } else if (path.endsWith("/strings")) data = source;
    else if (path.endsWith("/translations"))
      data = labels.map(([, , text], index) => ({
        stringId: index + 1,
        translationId: index + 21,
        text,
        contentType: "text/plain",
        user: { id: 1000 },
        createdAt: "2026-09-11T01:01:00Z",
      }));
    else if (path.endsWith("/approvals"))
      data = labels.map((_, index) => ({
        id: index + 31,
        stringId: index + 1,
        translationId: index + 21,
        user: { id: 17853021 },
        languageId: "zh-CN",
        createdAt: "2026-09-11T01:02:00Z",
      }));
    else throw new Error("Unexpected request");
    return Response.json(
      Array.isArray(data)
        ? { data: data.map((value) => ({ data: value })), pagination: { offset: 0, limit: 100 } }
        : { data },
    );
  };
}

function inputs(outputDir) {
  return {
    outputDir,
    env: { ...context(), CROWDIN_PRIVATE_RECORDING_TOKEN: "synthetic-token" },
    now: () => "2026-09-11T01:03:00Z",
    fetchImpl: nativeApi(),
    command: async (program, args) => {
      if (
        program === "gh" &&
        args[3] ===
          "repos/aidanaden/jupiter-i18n-translation-pilot/git/ref/heads/aidan/crowdin-private-recording-base-20260911"
      )
        return base;
      if (args[0] === "rev-parse") return sha;
      if (args[0] === "status") return "";
      if (args[0] === "fetch") return "";
      if (args[0] === "show") return execFileSync("git", args, { encoding: "utf8" });
      throw new Error("Unexpected command");
    },
  };
}

it("writes only a private candidate, native evidence, and a receipt with no delivery authority", async () => {
  const outputDir = join(await mkdtemp(join(tmpdir(), "private-cli-test-")), "output");
  await runPrivatePreparation(inputs(outputDir));
  expect((await readdir(outputDir)).sort()).toEqual([
    "candidate.po",
    "evidence.json",
    "receipt.json",
  ]);
  expect((await stat(outputDir)).mode & 0o777).toBe(0o700);
  for (const name of await readdir(outputDir))
    expect((await stat(join(outputDir, name))).mode & 0o777).toBe(0o600);
  const candidate = await readFile(join(outputDir, "candidate.po"), "utf8");
  expect(candidate).toContain('msgstr "余额 {balance}"');
  expect(candidate).not.toContain("synthetic-token");
  expect(JSON.parse(await readFile(join(outputDir, "receipt.json"), "utf8"))).toMatchObject({
    deliveryAllowed: false,
    mergeAllowed: false,
    deploymentAllowed: false,
    preservedMessages: 13,
    baseSha: base,
    trustedSha: sha,
  });
});

it.each(["base movement", "stale clock", "missing approval"])(
  "writes no output after %s",
  async (failure) => {
    const outputDir = join(await mkdtemp(join(tmpdir(), "private-cli-test-")), "output");
    const input = inputs(outputDir);
    const command = input.command;
    let reads = 0;
    input.command = async (program, args) => {
      if (program === "gh" && ++reads === 2 && failure === "base movement") return "b".repeat(40);
      return command(program, args);
    };
    input.now = () =>
      failure === "stale clock" && reads === 2 ? "2026-09-11T02:00:00Z" : "2026-09-11T01:03:00Z";
    const fetchImpl = input.fetchImpl;
    input.fetchImpl = async (url, options) => {
      if (failure === "missing approval" && url.includes("/approvals?"))
        return Response.json({ data: [], pagination: { offset: 0, limit: 100 } });
      return fetchImpl(url, options);
    };
    await expect(runPrivatePreparation(input)).rejects.toThrow();
    await expect(stat(outputDir)).rejects.toThrow();
  },
);

it("refuses an existing output folder without changing its files", async () => {
  const outputDir = join(await mkdtemp(join(tmpdir(), "private-cli-test-")), "output");
  await runPrivatePreparation(inputs(outputDir));
  const before = await readFile(join(outputDir, "receipt.json"), "utf8");
  await expect(runPrivatePreparation(inputs(outputDir))).rejects.toThrow();
  expect(await readFile(join(outputDir, "receipt.json"), "utf8")).toBe(before);
});

it("limits workflow execution to one trusted push branch with read-only authority", async () => {
  const workflow = parse(
    await readFile(
      new URL("../../.github/workflows/crowdin-private-evidence.yml", import.meta.url),
      "utf8",
    ),
  );
  expect(workflow.on).toEqual({
    push: { branches: ["aidan/crowdin-private-recording-delivery-20260911"] },
  });
  expect(workflow.permissions).toEqual({
    contents: "read",
    actions: "read",
    checks: "read",
    "pull-requests": "read",
  });
  expect(Object.keys(workflow.jobs)).toEqual(["prepare"]);
  const job = workflow.jobs.prepare;
  expect(job["timeout-minutes"]).toBe(10);
  expect(job.steps[0].with).toEqual({ ref: "${{ github.sha }}", "persist-credentials": false });
  expect(job.steps.filter((step) => step.run).map((step) => step.run)).toEqual([
    "pnpm install --frozen-lockfile --ignore-scripts",
    'node scripts/provider-e2e/crowdin-private-cli.mjs --prepare "$RUNNER_TEMP/crowdin-private-prepared"',
  ]);
  expect(job.steps.at(-2).env.CROWDIN_PRIVATE_RECORDING_TOKEN).toBe(
    "${{ secrets.CROWDIN_PRIVATE_RECORDING_TOKEN }}",
  );
  expect(job.steps.at(-1).with["retention-days"]).toBe(7);
});
function context() {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REPOSITORY: "aidanaden/jupiter-i18n-translation-pilot",
    GITHUB_REF: "refs/heads/aidan/crowdin-private-recording-delivery-20260911",
    GITHUB_SHA: sha,
    GITHUB_WORKFLOW_REF:
      "aidanaden/jupiter-i18n-translation-pilot/.github/workflows/crowdin-private-evidence.yml@refs/heads/aidan/crowdin-private-recording-delivery-20260911",
    GITHUB_WORKFLOW_SHA: sha,
  };
}

it.each([
  "GITHUB_ACTIONS",
  "GITHUB_REPOSITORY",
  "GITHUB_REF",
  "GITHUB_SHA",
  "GITHUB_WORKFLOW_REF",
  "GITHUB_WORKFLOW_SHA",
])("refuses wrong %s before secret access", async (key) => {
  const env = { ...context(), [key]: "wrong" };
  Object.defineProperty(env, "CROWDIN_PRIVATE_RECORDING_TOKEN", {
    get() {
      throw new Error("Secret was read");
    },
  });
  await expect(runPrivatePreparation({ env })).rejects.toThrow("Untrusted run");
});

it("refuses a moved base before native reads or output", async () => {
  const outputDir = join(await mkdtemp(join(tmpdir(), "private-cli-test-")), "output");
  await expect(
    runPrivatePreparation({
      env: context(),
      outputDir,
      command: async (program, args) =>
        args[0] === "status" ? "" : program === "git" ? sha : "b".repeat(40),
      fetchImpl() {
        throw new Error("Native read occurred");
      },
    }),
  ).rejects.toThrow("Source base moved");
  await expect(stat(outputDir)).rejects.toThrow();
});

it("refuses a wrong checkout before secret access", async () => {
  const env = context();
  Object.defineProperty(env, "CROWDIN_PRIVATE_RECORDING_TOKEN", {
    get() {
      throw new Error("Secret was read");
    },
  });
  await expect(
    runPrivatePreparation({
      env,
      outputDir: join(tmpdir(), "private-wrong-checkout-output"),
      command: async () => "b".repeat(40),
    }),
  ).rejects.toThrow("Wrong checkout");
});

it.each([undefined, "relative", "/"])(
  "refuses invalid output %s before commands",
  async (outputDir) => {
    await expect(
      runPrivatePreparation({
        env: context(),
        outputDir,
        command() {
          throw new Error("Command ran");
        },
      }),
    ).rejects.toThrow("Invalid output");
  },
);

it("refuses tracked checkout edits before native reads", async () => {
  const input = inputs(join(await mkdtemp(join(tmpdir(), "private-cli-test-")), "output"));
  const command = input.command;
  input.command = (program, args) =>
    args[0] === "status" ? " M scripts/changed.mjs" : command(program, args);
  await expect(runPrivatePreparation(input)).rejects.toThrow("Dirty checkout");
});

it("refuses an untrusted run before reading secrets or executing commands", async () => {
  const env = { GITHUB_EVENT_NAME: "pull_request" };
  Object.defineProperty(env, "CROWDIN_PRIVATE_RECORDING_TOKEN", {
    get() {
      throw new Error("Secret was read");
    },
  });
  await expect(
    runPrivatePreparation({
      env,
      command() {
        throw new Error("Command ran");
      },
    }),
  ).rejects.toThrow("Untrusted run");
});

it("refuses live mode until fresh candidate pins exist", async () => {
  const input = inputs(join(await mkdtemp(join(tmpdir(), "private-cli-test-")), "output"));
  input.verifyLive = true;
  await expect(runPrivatePreparation(input)).rejects.toThrow(
    "Fresh live verification is not configured",
  );
});

it("reaches missing fresh approvals without querying a PR or CI", async () => {
  const outputDir = join(await mkdtemp(join(tmpdir(), "private-cli-test-")), "output");
  const input = inputs(outputDir);
  const fetchImpl = input.fetchImpl;
  const requests = [];
  input.fetchImpl = async (url, options) => {
    requests.push(url);
    if (url.includes("/approvals?"))
      return Response.json({ data: [], pagination: { offset: 0, limit: 100 } });
    return fetchImpl(url, options);
  };
  await expect(runPrivatePreparation(input)).rejects.toThrow(
    "Missing unique current review approval",
  );
  expect(requests.some((url) => url.includes("/files/36"))).toBe(true);
  expect(requests.some((url) => url.includes("/approvals?languageId=zh-CN&fileId=36"))).toBe(true);
  await expect(stat(outputDir)).rejects.toThrow();
});
