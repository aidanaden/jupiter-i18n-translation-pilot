import { readFile } from "node:fs/promises";

import { expect, it } from "vitest";
import { formatter } from "@lingui/format-po";

import { lingoJsonToPo, poToLingoJson } from "./lingo-json.mjs";

it("sends English message values rather than semantic IDs", async () => {
  const source = await readFile(new URL("./live-lingo/locales/en.po", import.meta.url), "utf8");
  const messages = poToLingoJson(source);
  expect(Object.keys(messages)).toHaveLength(14);
  expect(messages["swap.fee"]).toBe("Network fee: {fee} SOL");
  expect(messages["swap.routes"]).toBe(
    "{count, plural, one {# route available} other {# routes available}}",
  );
});

it.each([
  ["message IDs", (messages) => Object.fromEntries(Object.keys(messages).map((id) => [id, id]))],
  [
    "missing key",
    (messages) => {
      delete messages["swap.submit"];
      return messages;
    },
  ],
  ["extra key", (messages) => ({ ...messages, "extra.key": "extra" })],
  ["missing placeholder", (messages) => ({ ...messages, "swap.fee": "Network fee SOL" })],
  ["unsafe tag", (messages) => ({ ...messages, "swap.details": "Read <script>bad</script>" })],
  ["blank value", (messages) => ({ ...messages, "swap.submit": " " })],
  ["wrong value type", (messages) => ({ ...messages, "swap.submit": 4 })],
  [
    "changed select key",
    (messages) => ({
      ...messages,
      "swap.status": "{status, select, waiting {Waiting} failed {Failed} other {Done}}",
    }),
  ],
])("rejects %s", async (_name, change) => {
  const source = await readFile(new URL("./live-lingo/locales/en.po", import.meta.url), "utf8");
  expect(() => lingoJsonToPo(source, change(poToLingoJson(source)))).toThrow();
});

it("rejects duplicate source IDs", async () => {
  const source = await readFile(new URL("./live-lingo/locales/en.po", import.meta.url), "utf8");
  expect(() => poToLingoJson(source + '\nmsgid "swap.submit"\nmsgstr "Another"\n')).toThrow();
});

it.each([
  ["invalid source ID", (source) => source.replace('msgid "swap.submit"', 'msgid "INVALID ID"')],
  ["blank source", (source) => source.replace('msgstr "Swap"', 'msgstr " "')],
])("rejects %s before upload", async (_name, change) => {
  const source = await readFile(new URL("./live-lingo/locales/en.po", import.meta.url), "utf8");
  expect(() => poToLingoJson(change(source))).toThrow();
});

it("rebuilds PO with the source IDs and context, using offline test translations", async () => {
  const source = await readFile(new URL("./live-lingo/locales/en.po", import.meta.url), "utf8");
  const target = await readFile(new URL("./fixtures/v1/zh-Hans.po", import.meta.url), "utf8");
  const parse = formatter({ explicitIdAsDefault: true }).parse;
  const translated = Object.fromEntries(
    Object.entries(parse(target)).map(([id, entry]) => [id, entry.translation]),
  );
  const rebuilt = parse(lingoJsonToPo(source, translated));
  expect(rebuilt["swap.fee"].translation).toContain("{fee} SOL");
  expect(rebuilt["swap.slippage"].comments).toEqual(parse(source)["swap.slippage"].comments);
  expect(Object.keys(rebuilt)).toHaveLength(14);
});
