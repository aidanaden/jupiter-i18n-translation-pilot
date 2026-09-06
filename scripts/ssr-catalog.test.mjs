import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { REHEARSAL_FIXTURE } from "./rehearsal-baseline.mjs";
import { readChineseSsrMarker, readSsrExpectations } from "./ssr-catalog.mjs";

const messageId = "baseline.swap.review";
const catalog = (translation) => `msgid "${messageId}"\nmsgstr ${JSON.stringify(translation)}\n`;

it("uses a fresh multiline PO translation and matches escaped SSR text", () => {
  const translated = "确认 & \"兑换\" 'SOL'";
  const po = `msgid "${messageId}"\nmsgstr ""\n"确认 & "\n"\\"兑换\\" 'SOL'"\n`;
  const marker = readChineseSsrMarker(po);
  const html = renderToStaticMarkup(createElement("button", null, translated));
  expect(html).toContain(marker);
  expect(marker).not.toBe(translated);
  expect(html).not.toContain(readChineseSsrMarker(catalog("查看兑换")));
});

it.each([
  ["missing", 'msgid "different.id"\nmsgstr "确认兑换"\n'],
  ["empty", catalog("")],
  ["whitespace", catalog("  ")],
  ["message ID fallback", catalog(messageId)],
  ["obsolete", '#~ msgid "baseline.swap.review"\n#~ msgstr "确认兑换"\n'],
  ["fuzzy", `#, fuzzy\n${catalog("确认兑换")}`],
  ["malformed PO", 'msgid "baseline.swap.review"\nmsgstr "unterminated\n'],
  ["invalid ICU", catalog("确认 {broken")],
  ["unexpected argument", catalog("确认 {asset}")],
])("rejects a %s marker instead of accepting fallback text", (_name, po) => {
  expect(() => readChineseSsrMarker(po)).toThrow();
});

it("uses ICU apostrophe escaping before checking the HTML", () => {
  const html = renderToStaticMarkup(createElement("button", null, "确认 {SOL} & <USDC>"));
  expect(html).toContain(readChineseSsrMarker(catalog("确认 '{SOL}' & <USDC>")));
});

const withProof = (translation) =>
  `${catalog("确认兑换")}\nmsgid "${REHEARSAL_FIXTURE.messageId}"\nmsgstr ${JSON.stringify(translation)}\n`;
const englishCatalog = withProof(REHEARSAL_FIXTURE.source);

it("accepts fresh proof text only in explicit Lingo mode and keeps English/pseudo checks", () => {
  const simplifiedChineseCatalog = withProof("翻译测试成功 & 已检查");
  expect(() => readSsrExpectations({ englishCatalog, simplifiedChineseCatalog })).toThrow(
    "reviewed fixed translation",
  );
  const expectations = readSsrExpectations({
    englishCatalog,
    simplifiedChineseCatalog,
    lingoE2e: true,
  });
  expect(expectations.state).toBe("lingo-e2e");
  expect(expectations.cases[1].rehearsalMarker).toBe("翻译测试成功 &amp; 已检查");
  const defaults = readSsrExpectations({
    englishCatalog,
    simplifiedChineseCatalog: withProof(REHEARSAL_FIXTURE.target),
  });
  expect(defaults.state).toBe("translated");
  expect(expectations.cases[0]).toEqual(defaults.cases[0]);
  expect(expectations.cases[2]).toEqual(defaults.cases[2]);
});

it("keeps the source fallback for the empty setup proof, but rejects a missing proof", () => {
  for (const lingoE2e of [false, true]) {
    const result = readSsrExpectations({
      englishCatalog,
      simplifiedChineseCatalog: withProof(""),
      lingoE2e,
    });
    expect(result.cases[1].rehearsalMarker).toBe(REHEARSAL_FIXTURE.source);
    expect(() =>
      readSsrExpectations({
        englishCatalog,
        simplifiedChineseCatalog: catalog("确认兑换"),
        lingoE2e,
      }),
    ).toThrow();
  }
});
