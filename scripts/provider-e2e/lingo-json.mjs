import { formatter } from "@lingui/format-po";
import * as z from "zod/v4-mini";

import { validateCatalogs } from "./offline-runner.mjs";

const po = formatter({ explicitIdAsDefault: true });
const messagesSchema = z.record(z.string(), z.string().check(z.minLength(1)));

export function poToLingoJson(sourcePo) {
  const source = po.parse(z.parse(z.string(), sourcePo));
  const messages = z.parse(
    messagesSchema,
    Object.fromEntries(Object.entries(source).map(([id, entry]) => [id, entry.translation])),
  );
  if (
    Object.keys(messages).length !== 14 ||
    [...sourcePo.matchAll(/^msgid /gm)].length !== 15 ||
    Object.entries(source).some(([id, entry]) => entry.obsolete || entry.translation === id)
  )
    throw new Error("Expected the 14-message English fixture with explicit IDs");
  validateCatalogs({
    sourcePo,
    targetPo: po.serialize(source, { locale: "zh-Hans", sourceLocale: "en" }),
    glossary: { terms: [] },
  });
  return messages;
}

export function lingoJsonToPo(sourcePo, result) {
  const sourceMessages = poToLingoJson(sourcePo);
  const translations = z.parse(messagesSchema, result);
  if (
    JSON.stringify(Object.keys(sourceMessages).sort()) !==
    JSON.stringify(Object.keys(translations).sort())
  )
    throw new Error("Returned IDs differ from the source");
  const source = po.parse(sourcePo);
  const catalog = Object.fromEntries(
    Object.entries(source).map(([id, entry]) => {
      if (!translations[id].trim() || translations[id] === id)
        throw new Error("Missing translation or returned message ID");
      return [id, { ...entry, translation: translations[id] }];
    }),
  );
  const targetPo = po.serialize(catalog, { locale: "zh-Hans", sourceLocale: "en" });
  validateCatalogs({ sourcePo, targetPo, glossary: { terms: [] } });
  return targetPo;
}
