import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test } from "vitest";

import { createOfflineRunner, readOfflineFixture } from "./offline-runner.mjs";

test("the CLI reports two deterministic offline cycles and exact restoration", async () => {
  const execute = promisify(execFile);
  const first = await execute(process.execPath, ["scripts/provider-e2e/run-offline.mjs"]);
  const second = await execute(process.execPath, ["scripts/provider-e2e/run-offline.mjs"]);
  expect(first.stdout).toBe(second.stdout);
  const report = JSON.parse(first.stdout);
  expect(report.mode).toBe("OFFLINE SIMULATED");
  expect(report.attempts).toHaveLength(2);
  expect(report.attempts[0].rendered.slippage).toBe("允许的滑点");
  expect(report.attempts[0].rendered.details).toBe(
    '确认前请阅读<a href="/offline-details">交易详情</a>。',
  );
  expect(report.attempts[0].released.deployedHead).not.toBe(
    report.attempts[1].released.deployedHead,
  );
  expect(report.final.deployedHash).toBe(report.baseline.baselineHash);
  expect(report.final.state).toBe("baseline");
});

test("a compiled draft cannot replace the baseline without simulated language approval", async () => {
  const fixture = await readOfflineFixture();
  const runner = createOfflineRunner(fixture);
  const head = runner.submit(fixture);
  runner.validate(head);
  expect(() => runner.release({ actor: "simulated-maintainer", head })).toThrow("approval");
  expect(runner.status().deployedHead).toBe("offline-baseline");
});

test("the fixture boundary rejects a different locale or an empty glossary", async () => {
  const fixture = await readOfflineFixture();
  const runner = createOfflineRunner(fixture);
  expect(() =>
    runner.submit({ ...fixture, glossary: { ...fixture.glossary, locale: "ja" } }),
  ).toThrow();
  expect(() =>
    runner.submit({ ...fixture, glossary: { ...fixture.glossary, terms: [] } }),
  ).toThrow();
  expect(() =>
    runner.submit({ ...fixture, glossary: { ...fixture.glossary, revision: "" } }),
  ).toThrow();
});

test("matching non-semantic message IDs cannot pass catalog checks", async () => {
  const fixture = await readOfflineFixture();
  const runner = createOfflineRunner(fixture);
  const head = runner.submit({
    ...fixture,
    sourcePo: fixture.sourcePo.replace('msgid "swap.submit"', 'msgid "Swap now!"'),
    targetPo: fixture.targetPo.replace('msgid "swap.submit"', 'msgid "Swap now!"'),
  });
  expect(() => runner.validate(head)).toThrow("semantic ID");
});

test("reset restores the exact baseline and an old head cannot release in a second run", async () => {
  const fixture = await readOfflineFixture();
  const runner = createOfflineRunner(fixture);
  const before = runner.status();
  const corrected = { ...fixture, targetPo: fixture.targetPo.replace("滑点容忍度", "允许的滑点") };
  const first = runner.submit(corrected);
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head: first });
  runner.validate(first);
  runner.release({ actor: "simulated-maintainer", head: first });
  expect(() => runner.reset({ actor: "simulated-ai", deployedHead: first })).toThrow("maintainer");
  expect(() => runner.reset({ actor: "simulated-maintainer", deployedHead: "wrong-head" })).toThrow(
    "Stale",
  );
  runner.reset({ actor: "simulated-maintainer", deployedHead: first });
  expect(runner.status()).toEqual(before);
  expect(runner.render("swap.slippage")).toBe("滑点容忍度");
  const second = runner.submit(corrected);
  expect(second).not.toBe(first);
  expect(() => runner.release({ actor: "simulated-maintainer", head: first })).toThrow("Stale");
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head: second });
  runner.validate(second);
  runner.release({ actor: "simulated-maintainer", head: second });
  expect(runner.render("swap.slippage")).toBe("允许的滑点");
  runner.reset({ actor: "simulated-maintainer", deployedHead: second });
  expect(runner.status()).toEqual(before);
});

test("next sync cannot overwrite a released correction while a replacement is pending", async () => {
  const fixture = await readOfflineFixture();
  const runner = createOfflineRunner(fixture);
  const corrected = { ...fixture, targetPo: fixture.targetPo.replace("滑点容忍度", "允许的滑点") };
  const head = runner.submit(corrected);
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head });
  runner.validate(head);
  runner.release({ actor: "simulated-maintainer", head });
  expect(runner.sync(corrected)).toBe(head);
  expect(() => runner.sync(fixture)).toThrow("correction freeze");
  expect(runner.render("swap.slippage")).toBe("允许的滑点");
  const pending = runner.sync({
    ...fixture,
    sourcePo: fixture.sourcePo.replace("Your transaction may fail", "The transaction may fail"),
  });
  runner.validate(pending);
  expect(() => runner.release({ actor: "simulated-maintainer", head: pending })).toThrow(
    "approval",
  );
  expect(runner.render("swap.slippage")).toBe("允许的滑点");
  expect(runner.status().deployedHead).toBe(head);
});

test.each(["source", "target", "glossary", "context"])(
  "a changed %s needs fresh approval and validation",
  async (change) => {
    const fixture = await readOfflineFixture();
    const runner = createOfflineRunner(fixture);
    const approvedHead = runner.submit(fixture);
    runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head: approvedHead });
    runner.validate(approvedHead);
    const changed = structuredClone(fixture);
    if (change === "source")
      changed.sourcePo = changed.sourcePo.replace(
        "Your transaction may fail",
        "The transaction may fail",
      );
    if (change === "target")
      changed.targetPo = changed.targetPo.replace("滑点容忍度", "允许的滑点");
    if (change === "glossary") changed.glossary.revision = "candidate-v2";
    if (change === "context") {
      changed.sourcePo = changed.sourcePo.replace("Swap button.", "Swap confirmation button.");
      changed.targetPo = changed.targetPo.replace("Swap button.", "Swap confirmation button.");
    }
    const newHead = runner.submit(changed);
    expect(runner.status().state).toBe("draft");
    expect(() => runner.release({ actor: "simulated-maintainer", head: approvedHead })).toThrow(
      "Stale",
    );
    runner.validate(newHead);
    expect(() => runner.release({ actor: "simulated-maintainer", head: newHead })).toThrow(
      "approval",
    );
    expect(() =>
      runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head: approvedHead }),
    ).toThrow("Stale");
    expect(runner.render("swap.slippage")).toBe("滑点容忍度");
  },
);

test.each([
  ["missing variable", "您将收到 {amount} {token}", "您将收到 {amount}"],
  ["changed ICU type", "{count, plural, other {有 # 条可用路径}}", "有 {count} 条可用路径"],
  [
    "broken ICU",
    "{count, plural, other {有 # 条可用路径}}",
    "{count, plural, other {有 # 条可用路径}",
  ],
  ["changed select key", "failed {交易失败}", "success {交易失败}"],
  ["missing rich tag", "<link>交易详情</link>", "交易详情"],
  ["unbalanced tag", "<link>交易详情</link>", "<link>交易详情</strong>"],
  ["unsafe tag", "<link>交易详情</link>", "<script>交易详情</script>"],
  ["tag attributes", "<link>交易详情</link>", "<link href='bad'>交易详情</link>"],
  ["missing ID", 'msgid "swap.submit"', 'msgid "swap.renamed"'],
  ["missing context", "Swap button. Fixed-data demonstration only.", ""],
  ["missing target", 'msgstr "兑换"', 'msgstr ""'],
  ["preferred term", "滑点容忍度", "滑动容忍度"],
  ["product name", "在 Jupiter 上", "在 木星 上"],
  ["wrong PO language", "Language: zh-Hans", "Language: ja"],
  [
    "duplicate ID",
    'msgstr "兑换"',
    'msgstr "兑换"\n\n#. Swap button. Fixed-data demonstration only.\nmsgid "swap.submit"\nmsgstr "兑换"',
  ],
  ["extra ID", 'msgstr "兑换"', 'msgstr "兑换"\n\nmsgid "swap.extra"\nmsgstr "额外"'],
])("validation blocks %s before release", async (_, from, to) => {
  const fixture = await readOfflineFixture();
  const runner = createOfflineRunner(fixture);
  const head = runner.submit({ ...fixture, targetPo: fixture.targetPo.replace(from, to) });
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head });
  expect(() => runner.validate(head)).toThrow();
  expect(() => runner.release({ actor: "simulated-maintainer", head })).toThrow("validation");
  expect(runner.status().deployedHead).toBe("offline-baseline");
});

test("the corrected approved catalog renders through Lingui and React on the server", async () => {
  const fixture = await readOfflineFixture();
  const runner = createOfflineRunner(fixture);
  const draft = runner.submit({
    ...fixture,
    targetPo: fixture.targetPo.replace("滑点容忍度", "滑动容忍度"),
  });
  const head = runner.correct({
    actor: "simulated-zh-reviewer",
    head: draft,
    targetPo: fixture.targetPo.replace("滑点容忍度", "允许的滑点"),
  });
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head });
  runner.validate(head);
  runner.release({ actor: "simulated-maintainer", head });
  expect(runner.render("swap.slippage")).toBe("允许的滑点");
  expect(runner.render("swap.routes", { count: 2 })).toBe("有 2 条可用路径");
  expect(runner.render("swap.status", { status: "failed" })).toBe("交易失败");
  expect(runner.render("swap.receive", { amount: "2.5", token: "SOL" })).toBe("您将收到 2.5 SOL");
  expect(runner.render("swap.details")).toBe(
    '确认前请阅读<a href="/offline-details">交易详情</a>。',
  );
  expect(runner.render("swap.irreversible")).toBe("<strong>转账无法撤销。</strong>请检查地址。");
});

test("only the simulated Chinese reviewer can approve the exact candidate", async () => {
  const runner = createOfflineRunner(await readOfflineFixture());
  const head = runner.submit(await readOfflineFixture());
  expect(() => runner.approve({ actor: "simulated-ai", locale: "zh-Hans", head })).toThrow(
    "reviewer",
  );
  expect(() => runner.approve({ actor: "simulated-zh-reviewer", locale: "ja", head })).toThrow(
    "locale",
  );
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head });
  expect(() => runner.release({ actor: "simulated-maintainer", head })).toThrow("validation");
  runner.validate(head);
  expect(() => runner.release({ actor: "simulated-ai", head })).toThrow("maintainer");
  runner.release({ actor: "simulated-maintainer", head });
  expect(runner.status().deployedHead).toBe(head);
});

test("a missing plural number blocks validation and release", async () => {
  const fixture = await readOfflineFixture();
  const runner = createOfflineRunner(fixture);
  const head = runner.submit({
    ...fixture,
    targetPo: fixture.targetPo.replace("有 # 条可用路径", "有 条可用路径"),
  });
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head });
  expect(() => runner.validate(head)).toThrow("ICU arguments differ");
  expect(() => runner.release({ actor: "simulated-maintainer", head })).toThrow("validation");
  expect(runner.render("swap.routes", { count: 2 })).toBe("有 2 条可用路径");
});

test("a missing plural number in one select branch cannot use another branch's number", async () => {
  const fixture = await readOfflineFixture();
  const nested = {
    ...fixture,
    sourcePo: fixture.sourcePo.replace(
      "{count, plural, one {# route available} other {# routes available}}",
      "{status, select, pending {{count, plural, one {# pending route} other {# pending routes}}} other {{count, plural, one {# route} other {# routes}}}}",
    ),
    targetPo: fixture.targetPo.replace(
      "{count, plural, other {有 # 条可用路径}}",
      "{status, select, pending {{count, plural, other {有 # 条待处理路径}}} other {{count, plural, other {有 # 条路径}}}}",
    ),
  };
  const runner = createOfflineRunner(nested);
  expect(runner.render("swap.routes", { count: 2, status: "pending" })).toBe("有 2 条待处理路径");
  const head = runner.submit({
    ...nested,
    targetPo: nested.targetPo.replace("有 # 条待处理路径", "有 条待处理路径"),
  });
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head });
  expect(() => runner.validate(head)).toThrow("ICU arguments differ");
  expect(() => runner.release({ actor: "simulated-maintainer", head })).toThrow("validation");
});

test("a select inside a plural must keep each branch's number marker", async () => {
  const fixture = await readOfflineFixture();
  const nested = {
    ...fixture,
    sourcePo: fixture.sourcePo.replace(
      "{count, plural, one {# route available} other {# routes available}}",
      "{count, plural, other {{status, select, failed {# failed} other {# okay}}}}",
    ),
    targetPo: fixture.targetPo.replace(
      "{count, plural, other {有 # 条可用路径}}",
      "{count, plural, other {{status, select, failed {# 失败} other {# 成功}}}}",
    ),
  };
  const runner = createOfflineRunner(nested);
  expect(runner.render("swap.routes", { count: 2, status: "failed" })).toBe("# 失败");
  expect(runner.render("swap.routes", { count: 2, status: "other" })).toBe("# 成功");
  const head = runner.submit({
    ...nested,
    targetPo: nested.targetPo.replace("failed {# 失败}", "failed {失败}"),
  });
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head });
  expect(() => runner.validate(head)).toThrow("ICU arguments differ");
  expect(() => runner.release({ actor: "simulated-maintainer", head })).toThrow("validation");
});
