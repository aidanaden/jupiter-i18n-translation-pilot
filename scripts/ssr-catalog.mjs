import assert from "node:assert/strict";

import { createCompiledCatalog } from "@lingui/cli/api";
import { formatter } from "@lingui/format-po";
import { renderToStaticMarkup } from "react-dom/server";

import { REHEARSAL_FIXTURE } from "./rehearsal-baseline.mjs";

const REHEARSAL_PSEUDO = "⟦       Ţŕàńśĺàţĩōń ŕēĥēàŕśàĺ ćōḿƥĺēţē       ⟧";

export function readSsrExpectations({
  englishCatalog,
  simplifiedChineseCatalog,
  lingoE2e = false,
}) {
  let lingoProof;
  if (lingoE2e) {
    const po = formatter({ explicitIdAsDefault: true });
    assert.equal(
      po.parse(englishCatalog)[REHEARSAL_FIXTURE.messageId]?.translation,
      REHEARSAL_FIXTURE.source,
      "The rehearsal source text changed",
    );
    const proof = po.parse(simplifiedChineseCatalog)[REHEARSAL_FIXTURE.messageId];
    assert.ok(proof && !proof.obsolete, "The Chinese proof entry must be present");
    lingoProof =
      proof.translation === ""
        ? REHEARSAL_FIXTURE.source
        : readChineseSsrMarker(simplifiedChineseCatalog, REHEARSAL_FIXTURE.messageId);
  }
  const state = lingoE2e
    ? "lingo-e2e"
    : readRehearsalState({ englishCatalog, simplifiedChineseCatalog });
  return {
    state,
    cases: [
      {
        locale: "en",
        marker: "Review swap",
        rehearsalMarker: state === "baseline" ? null : REHEARSAL_FIXTURE.source,
      },
      {
        locale: "zh-Hans",
        marker: readChineseSsrMarker(simplifiedChineseCatalog),
        rehearsalMarker: lingoE2e
          ? lingoProof
          : state === "baseline"
            ? null
            : state === "translated"
              ? REHEARSAL_FIXTURE.target
              : REHEARSAL_FIXTURE.source,
      },
      {
        locale: "en-XA",
        marker: "Ŕēvĩēŵ śŵàƥ",
        rehearsalMarker: state === "baseline" ? null : REHEARSAL_PSEUDO,
      },
    ],
  };
}

export function readChineseSsrMarker(catalog, messageId = "baseline.swap.review") {
  const entry = formatter({ explicitIdAsDefault: true }).parse(catalog)[messageId];
  assert.ok(
    entry &&
      !entry.obsolete &&
      !entry.extra?.flags?.includes("fuzzy") &&
      entry.translation?.trim() &&
      entry.translation !== messageId,
    `${messageId}: expected a current, nonempty Chinese translation`,
  );
  const compiled = createCompiledCatalog(
    "zh-Hans",
    { [messageId]: entry.translation },
    { strict: true, namespace: "json" },
  );
  assert.equal(compiled.errors.length, 0, `${messageId}: invalid ICU translation`);
  const tokens = JSON.parse(compiled.source).messages[messageId];
  assert.ok(
    Array.isArray(tokens) && tokens.every((token) => typeof token === "string"),
    `${messageId}: the SSR marker must not require arguments`,
  );
  return renderToStaticMarkup(tokens.join(""));
}

function readRehearsalState({ englishCatalog, simplifiedChineseCatalog }) {
  const englishValue = readPoValue(englishCatalog, REHEARSAL_FIXTURE.messageId);
  const simplifiedChineseValue = readPoValue(simplifiedChineseCatalog, REHEARSAL_FIXTURE.messageId);

  if (englishValue === null && simplifiedChineseValue === null) return "baseline";
  assert.equal(englishValue, REHEARSAL_FIXTURE.source, "The rehearsal source text changed");
  if (simplifiedChineseValue === "") return "source";
  assert.equal(
    simplifiedChineseValue,
    REHEARSAL_FIXTURE.target,
    "The rehearsal target must be empty or the reviewed fixed translation",
  );
  return "translated";
}

function readPoValue(catalog, messageId) {
  const escapedMessageId = messageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = catalog.match(new RegExp(`msgid "${escapedMessageId}"\\nmsgstr "([^"]*)"`));
  return match?.[1] ?? null;
}
