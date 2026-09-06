import assert from "node:assert/strict";

import { createOfflineRunner, readOfflineFixture } from "./offline-runner.mjs";

assert.equal(process.argv.length, 2, "This offline command takes no arguments");
const fixture = await readOfflineFixture();
const runner = createOfflineRunner(fixture);
const baseline = runner.status();
const attempts = [];

for (let attempt = 1; attempt <= 2; attempt += 1) {
  const checks = [];
  const injected = { ...fixture, targetPo: fixture.targetPo.replace("滑点容忍度", "滑动容忍度") };
  const draftHead = runner.submit(injected);
  const draft = runner.status();
  assert.throws(() => runner.validate(draftHead), /glossary term/);
  checks.push("Injected terminology error blocked by glossary check");
  assert.throws(
    () => runner.release({ actor: "simulated-maintainer", head: draftHead }),
    /approval/,
  );
  checks.push("Missing language approval blocks release");
  assert.throws(
    () => runner.approve({ actor: "simulated-ai", locale: "zh-Hans", head: draftHead }),
    /reviewer/,
  );
  checks.push("Wrong actor cannot approve");

  const corrected = { ...fixture, targetPo: fixture.targetPo.replace("滑点容忍度", "允许的滑点") };
  const head = runner.correct({
    actor: "simulated-zh-reviewer",
    head: draftHead,
    targetPo: corrected.targetPo,
  });
  const correctedDraft = runner.status();
  runner.approve({ actor: "simulated-zh-reviewer", locale: "zh-Hans", head });
  const approved = runner.status();
  runner.validate(head);
  const validated = runner.status();
  assert.throws(() => runner.release({ actor: "simulated-maintainer", head: draftHead }), /Stale/);
  checks.push("A stale head cannot release");
  runner.release({ actor: "simulated-maintainer", head });
  const released = runner.status();
  const rendered = {
    slippage: runner.render("swap.slippage"),
    routes: runner.render("swap.routes", { count: 2 }),
    status: runner.render("swap.status", { status: "failed" }),
    receive: runner.render("swap.receive", { amount: "2.5", token: "SOL" }),
    details: runner.render("swap.details"),
  };
  assert.equal(rendered.slippage, "允许的滑点");
  assert.equal(rendered.routes, "有 2 条可用路径");
  assert.equal(rendered.details, '确认前请阅读<a href="/offline-details">交易详情</a>。');
  checks.push("Approved text rendered through the compiled Lingui catalog and React");

  assert.equal(runner.sync(corrected), head);
  assert.throws(() => runner.sync(injected), /correction freeze/);
  const afterSync = runner.status();
  checks.push("Repeated sync preserves the released correction");
  const pendingHead = runner.sync({
    ...fixture,
    sourcePo: fixture.sourcePo.replace("Your transaction may fail", "The transaction may fail"),
  });
  runner.validate(pendingHead);
  assert.throws(
    () => runner.release({ actor: "simulated-maintainer", head: pendingHead }),
    /approval/,
  );
  assert.equal(runner.render("swap.slippage"), "允许的滑点");
  const pending = runner.status();
  checks.push("Pending replacement retains the previously released text");

  runner.reset({ actor: "simulated-maintainer", deployedHead: head });
  const restored = runner.status();
  assert.deepEqual(restored, baseline);
  assert.equal(runner.render("swap.slippage"), "滑点容忍度");
  checks.push("Exact baseline restored in memory");
  attempts.push({
    attempt,
    injectedError: "Synthetic terminology error, not AI output",
    checks,
    draft,
    correctedDraft,
    approved,
    validated,
    released,
    rendered,
    afterSync,
    pending,
    restored,
  });
}

process.stdout.write(
  `${JSON.stringify(
    {
      mode: "OFFLINE SIMULATED",
      fixtureVersion: "v1",
      limitations:
        "No provider, AI generation, qualified human review, GitHub protection, deployment, browser, or recording was tested. Actors and releases are in-memory simulations.",
      baseline,
      attempts,
      final: runner.status(),
    },
    null,
    2,
  )}\n`,
);
