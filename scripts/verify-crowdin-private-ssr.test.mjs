import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

import { verifyPrivateSwapHtml } from "./verify-crowdin-private-ssr.mjs";

it("accepts rendered English fallback for the six blank Chinese labels", async () => {
  const englishCatalog = await readFile("src/i18n/locales/en/messages.po", "utf8");
  const targetCatalog = (await readFile("src/i18n/locales/zh-Hans/messages.po", "utf8")).replace(
    /(msgid "swap\.form\.[^"]+"\nmsgstr )"[^"\n]*"/g,
    '$1""',
  );
  expect(() =>
    verifyPrivateSwapHtml({
      locale: "zh-Hans",
      englishCatalog,
      targetCatalog,
      html: '<html lang="zh-Hans"><body><span>Balance 12.40</span><span>Limit</span><span>Market</span><span>You pay</span><span>You receive</span><span>Recurring</span><span>检查兑换</span></body></html>',
    }),
  ).not.toThrow();
});

it("requires the Chinese catalog values in the rendered body, not serialized scripts", async () => {
  const englishCatalog = await readFile("src/i18n/locales/en/messages.po", "utf8");
  const values = {
    balance: "余额 {balance}",
    limit: "限价",
    market: "市价",
    pay: "您支付",
    receive: "您将收到",
    recurring: "定期",
  };
  const targetCatalog = (await readFile("src/i18n/locales/zh-Hans/messages.po", "utf8")).replace(
    /(msgid "swap\.form\.([^"]+)"\nmsgstr )"[^"\n]*"/g,
    (_, prefix, id) => `${prefix}${JSON.stringify(values[id])}`,
  );
  const html =
    '<html lang="zh-Hans"><body><span>余额 12.40</span><span>限价</span><span>市价</span><span>您支付</span><span>您将收到</span><span>定期</span><span>检查兑换</span></body></html>';
  const verify = (candidate, catalog = targetCatalog) =>
    verifyPrivateSwapHtml({
      html: candidate,
      locale: "zh-Hans",
      englishCatalog,
      targetCatalog: catalog,
    });
  expect(() => verify(html)).not.toThrow();
  expect(() => verify(html.replace("您支付", "You pay"))).toThrow(/missing rendered/);
  expect(() => verify(html.replace("您支付", "<script>您支付</script>"))).toThrow(
    /missing rendered/,
  );
  expect(() => verify(html.replace("12.40", "{balance}"))).toThrow();
  expect(() => verify(html.replace("市价", "swap.form.market"))).toThrow();
  expect(() => verify(html.replace('lang="zh-Hans"', 'lang="en"'))).toThrow();
  expect(() => verify(html, targetCatalog.replace("余额 {balance}", "余额 {amount}"))).toThrow(
    /placeholder changed/,
  );
  expect(() => verify(html, targetCatalog.replace("您支付", " "))).toThrow();
  expect(() =>
    verify(html.replace("您支付", "You pay"), targetCatalog.replace("您支付", "You pay")),
  ).toThrow();
  expect(() =>
    verify(html.replace("您支付", "您支付 {"), targetCatalog.replace("您支付", "您支付 {")),
  ).toThrow();
  expect(() => verify(html, targetCatalog.replace('msgstr "检查兑换"', 'msgstr ""'))).toThrow();
});
