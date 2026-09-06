import { readFile } from "node:fs/promises";

import { formatter } from "@lingui/format-po";
import { setupI18n } from "@lingui/core";
import { I18nProvider, Trans } from "@lingui/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { createAppSourcePacket, stageAppCandidate } from "./app-catalog.mjs";
import { lingoJsonToPo, poToLingoJson } from "./lingo-json.mjs";
import { validateCatalogs } from "./offline-runner.mjs";

const po = formatter({ explicitIdAsDefault: true });
const gitHead = "ed5dc31e70930c8bdb7d3675d208dd99395647d2";

async function input() {
  const [sourcePo, baselineTargetPo] = await Promise.all(
    ["en", "zh-Hans"].map((locale) =>
      readFile(new URL(`../../src/i18n/locales/${locale}/messages.po`, import.meta.url), "utf8"),
    ),
  );
  return { sourcePo, baselineTargetPo, gitHead };
}

function result(baselineTargetPo) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(po.parse(baselineTargetPo)).map(([id, entry]) => [
        id,
        entry.translation || "翻译演练完成",
      ]),
    ),
    null,
    2,
  );
}

it("stages all 13 real app messages without changing the baseline or asserting review", async () => {
  const initial = await input();
  const packet = createAppSourcePacket(initial);
  const rawTargetJson = result(initial.baselineTargetPo);
  const candidate = stageAppCandidate({
    sourcePacket: packet,
    rawTargetJson,
    currentSourcePo: initial.sourcePo,
    currentBaselineTargetPo: initial.baselineTargetPo,
    expectedGitHead: gitHead,
  });
  expect(Object.keys(packet.sourceJson)).toHaveLength(13);
  expect(packet.sourcePo).toBe(initial.sourcePo);
  expect(packet.baselineTargetPo).toBe(initial.baselineTargetPo);
  expect(packet.disclosure).toEqual({ commentsSent: false, glossaryConfigured: false });
  expect(candidate.status).toBe("unreviewed");
  expect(candidate.deliveryAllowed).toBe(false);
  expect(candidate.rawTargetJson).toBe(rawTargetJson);
  expect(po.parse(candidate.candidatePo)["pilot.recording.proof"].translation).toBe("翻译演练完成");
  expect(po.parse(initial.baselineTargetPo)["pilot.recording.proof"].translation).toBe("");
  expect(
    Object.keys(
      validateCatalogs({
        sourcePo: initial.sourcePo,
        targetPo: candidate.candidatePo,
        glossary: { terms: [] },
      }),
    ),
  ).toHaveLength(13);
});

it("requires an explicit count for the real app while the saved fixture keeps the default", async () => {
  const initial = await input();
  expect(() => poToLingoJson(initial.sourcePo)).toThrow();
  expect(Object.keys(poToLingoJson(initial.sourcePo, { expectedMessageCount: 13 }))).toHaveLength(
    13,
  );
  expect(() =>
    lingoJsonToPo(initial.sourcePo, JSON.parse(result(initial.baselineTargetPo))),
  ).toThrow();
  const oldSource = await readFile(new URL("./live-lingo/locales/en.po", import.meta.url), "utf8");
  expect(Object.keys(poToLingoJson(oldSource))).toHaveLength(14);
});

it.each([
  ["source bytes", (value) => ({ ...value, currentSourcePo: `${value.currentSourcePo}\n` })],
  [
    "baseline bytes",
    (value) => ({ ...value, currentBaselineTargetPo: `${value.currentBaselineTargetPo}\n` }),
  ],
  ["Git head", (value) => ({ ...value, expectedGitHead: "a".repeat(40) })],
  [
    "packet digest",
    (value) => ({ ...value, sourcePacket: { ...value.sourcePacket, digest: "a".repeat(64) } }),
  ],
  [
    "packet source JSON",
    (value) => ({
      ...value,
      sourcePacket: {
        ...value.sourcePacket,
        sourceJson: { ...value.sourcePacket.sourceJson, "pilot.recording.proof": "Changed" },
      },
    }),
  ],
  [
    "packet hash",
    (value) => ({
      ...value,
      sourcePacket: {
        ...value.sourcePacket,
        hashes: { ...value.sourcePacket.hashes, baselineTargetPo: "a".repeat(64) },
      },
    }),
  ],
  [
    "claimed approval",
    (value) => ({ ...value, sourcePacket: { ...value.sourcePacket, approved: true } }),
  ],
  [
    "claimed glossary",
    (value) => ({
      ...value,
      sourcePacket: {
        ...value.sourcePacket,
        disclosure: { ...value.sourcePacket.disclosure, glossaryConfigured: true },
      },
    }),
  ],
])("rejects changed %s", async (_label, change) => {
  const initial = await input();
  expect(() =>
    stageAppCandidate(
      change({
        sourcePacket: createAppSourcePacket(initial),
        rawTargetJson: result(initial.baselineTargetPo),
        currentSourcePo: initial.sourcePo,
        currentBaselineTargetPo: initial.baselineTargetPo,
        expectedGitHead: gitHead,
      }),
    ),
  ).toThrow();
});

it.each([
  [
    "missing ID",
    (messages) => {
      delete messages["pilot.recording.proof"];
      return messages;
    },
  ],
  ["extra ID", (messages) => ({ ...messages, "extra.message": "额外" })],
  [
    "source as ID",
    (messages) => ({ ...messages, "pilot.recording.proof": "pilot.recording.proof" }),
  ],
  ["missing placeholder", (messages) => ({ ...messages, "baseline.onboard.title": "充值" })],
  ["broken ICU", (messages) => ({ ...messages, "baseline.onboard.title": "通过 {jupiter 充值" })],
  [
    "changed select keys",
    (messages) => ({
      ...messages,
      "sandbox.onboard.wallet-state":
        "{walletState, select, first {设置钱包} funded {充值} other {查看钱包}}",
    }),
  ],
  [
    "missing plural number",
    (messages) => ({
      ...messages,
      "sandbox.swap.market-count": "{routeCount, plural, other {此路线使用市场。}}",
    }),
  ],
  [
    "unsafe tag",
    (messages) => ({ ...messages, "sandbox.translation.guide": "阅读<script>指南</script>" }),
  ],
  ["blank result", (messages) => ({ ...messages, "pilot.recording.proof": " " })],
  ["non-string result", (messages) => ({ ...messages, "pilot.recording.proof": 1 })],
])("does not stage %s", async (_label, change) => {
  const initial = await input();
  expect(() =>
    stageAppCandidate({
      sourcePacket: createAppSourcePacket(initial),
      rawTargetJson: JSON.stringify(change(JSON.parse(result(initial.baselineTargetPo)))),
      currentSourcePo: initial.sourcePo,
      currentBaselineTargetPo: initial.baselineTargetPo,
      expectedGitHead: gitHead,
    }),
  ).toThrow();
});

it.each([
  ["unknown fields", (value) => ({ ...value, approved: true })],
  ["invalid head", (value) => ({ ...value, gitHead: "main" })],
  [
    "wrong baseline language",
    (value) => ({
      ...value,
      baselineTargetPo: value.baselineTargetPo.replace("Language: zh-Hans", "Language: en"),
    }),
  ],
  [
    "extra baseline ID",
    (value) => ({
      ...value,
      baselineTargetPo: `${value.baselineTargetPo}\nmsgid "extra.message"\nmsgstr "额外"\n`,
    }),
  ],
  [
    "duplicate baseline ID",
    (value) => ({
      ...value,
      baselineTargetPo: `${value.baselineTargetPo}\nmsgid "pilot.recording.proof"\nmsgstr "额外"\n`,
    }),
  ],
  [
    "baseline context change",
    (value) => ({
      ...value,
      baselineTargetPo: value.baselineTargetPo.replace(
        "Synthetic proof message",
        "Changed proof message",
      ),
    }),
  ],
  [
    "baseline ICU change",
    (value) => ({
      ...value,
      baselineTargetPo: value.baselineTargetPo.replace("{jupiter}", "{wrong}"),
    }),
  ],
  [
    "source as ID",
    (value) => ({
      ...value,
      sourcePo: value.sourcePo.replace('msgstr "Review swap"', 'msgstr "baseline.swap.review"'),
    }),
  ],
])("does not prepare %s", async (_label, change) => {
  const initial = await input();
  expect(() => createAppSourcePacket(change(initial))).toThrow();
});

it.each([11, 21, 13.5, "13", null])(
  "rejects invalid message count %s",
  async (expectedMessageCount) => {
    const initial = await input();
    expect(() => poToLingoJson(initial.sourcePo, { expectedMessageCount })).toThrow();
    expect(() =>
      lingoJsonToPo(initial.sourcePo, JSON.parse(result(initial.baselineTargetPo)), {
        expectedMessageCount,
      }),
    ).toThrow();
  },
);

it("binds raw bytes separately from the candidate and freezes the returned packet", async () => {
  const initial = await input();
  const packet = createAppSourcePacket(initial);
  const rawTargetJson = result(initial.baselineTargetPo);
  const stage = (raw) =>
    stageAppCandidate({
      sourcePacket: JSON.parse(JSON.stringify(packet)),
      rawTargetJson: raw,
      currentSourcePo: initial.sourcePo,
      currentBaselineTargetPo: initial.baselineTargetPo,
      expectedGitHead: gitHead,
    });
  const first = stage(rawTargetJson);
  const second = stage(`${rawTargetJson}\n`);
  expect(first.candidatePo).toBe(second.candidatePo);
  expect(first.hashes.rawTargetJson).not.toBe(second.hashes.rawTargetJson);
  expect(first.hashes.candidatePo).toBe(second.hashes.candidatePo);
  expect(() => {
    packet.sourceJson["pilot.recording.proof"] = "Changed";
  }).toThrow();
  expect(() => {
    first.status = "approved";
  }).toThrow();
});

it("renders the synthetic review text, plural, select, and rich link through real Lingui and React", async () => {
  const initial = await input();
  const messages = JSON.parse(result(initial.baselineTargetPo));
  messages["baseline.swap.review"] = "测试：检查兑换";
  const candidate = stageAppCandidate({
    sourcePacket: createAppSourcePacket(initial),
    rawTargetJson: JSON.stringify(messages),
    currentSourcePo: initial.sourcePo,
    currentBaselineTargetPo: initial.baselineTargetPo,
    expectedGitHead: gitHead,
  });
  const compiled = validateCatalogs({
    sourcePo: initial.sourcePo,
    targetPo: candidate.candidatePo,
    glossary: { terms: [] },
  });
  const i18n = setupI18n({ locale: "zh-Hans", messages: { "zh-Hans": compiled } });
  const render = (id, values = {}, components = {}) =>
    renderToStaticMarkup(
      createElement(I18nProvider, { i18n }, createElement(Trans, { id, values, components })),
    );
  expect(render("baseline.swap.review")).toBe("测试：检查兑换");
  expect(render("sandbox.swap.market-count", { routeCount: 3 })).toBe("此路线使用 3 个市场。");
  expect(render("sandbox.onboard.wallet-state", { walletState: "funded" })).toBe("向您的钱包充值");
  expect(
    render(
      "sandbox.translation.guide",
      {},
      { link: createElement("a", { href: "/translation-guide" }) },
    ),
  ).toBe('编辑占位符前，请阅读<a href="/translation-guide">翻译指南</a>。');
  expect(candidate.deliveryAllowed).toBe(false);
});
