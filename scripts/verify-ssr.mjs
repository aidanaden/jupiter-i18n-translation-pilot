import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import * as z from "zod/v4-mini";

import { REHEARSAL_FIXTURE } from "./rehearsal-baseline.mjs";

const REHEARSAL_PSEUDO = "⟦       Ţŕàńśĺàţĩōń ŕēĥēàŕśàĺ ćōḿƥĺēţē       ⟧";

const englishCatalog = await readFile("src/i18n/locales/en/messages.po", "utf8");
const simplifiedChineseCatalog = await readFile("src/i18n/locales/zh-Hans/messages.po", "utf8");
const rehearsalState = readRehearsalState({ englishCatalog, simplifiedChineseCatalog });

const port = await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const address = z.parse(z.object({ port: z.number() }), socket.address());
    socket.close(() => resolve(address.port));
  });
});

const preview = spawn(
  "pnpm",
  ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk;
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk;
});

const baseUrl = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 45_000;

try {
  while (true) {
    try {
      const response = await fetch(`${baseUrl}/?locale=en&page=swap`);
      if (response.ok) break;
    } catch {
      if (Date.now() >= deadline) throw new Error(`Preview did not start.\n${previewOutput}`);
    }

    if (Date.now() >= deadline) throw new Error(`Preview did not start.\n${previewOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const cases = [
    {
      locale: "en",
      marker: "Review swap",
      rehearsalMarker: rehearsalState === "baseline" ? null : REHEARSAL_FIXTURE.source,
    },
    {
      locale: "zh-Hans",
      marker: "查看兑换",
      rehearsalMarker:
        rehearsalState === "baseline"
          ? null
          : rehearsalState === "translated"
            ? REHEARSAL_FIXTURE.target
            : REHEARSAL_FIXTURE.source,
    },
    {
      locale: "en-XA",
      marker: "Ŕēvĩēŵ śŵàƥ",
      rehearsalMarker: rehearsalState === "baseline" ? null : REHEARSAL_PSEUDO,
    },
  ];

  for (const { locale, marker, rehearsalMarker } of cases) {
    const response = await fetch(`${baseUrl}/?locale=${locale}&page=swap`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]+lang="${locale}"`));
    assert.ok(html.includes(marker), `${locale} SSR HTML did not contain ${marker}`);
    assert.ok(html.includes("/jupiter-logo.svg"));
    assert.ok(html.includes("Commit "));
    assert.ok(html.includes("Catalog "));
    if (rehearsalMarker) {
      assert.ok(
        html.includes(rehearsalMarker),
        `${locale} SSR HTML did not contain ${rehearsalMarker}`,
      );
    } else {
      assert.ok(!html.includes(REHEARSAL_FIXTURE.source));
      assert.ok(!html.includes(REHEARSAL_FIXTURE.target));
    }
  }

  console.log(`SSR preview verified for en, zh-Hans, and en-XA in ${rehearsalState} state.`);
} finally {
  preview.kill("SIGTERM");
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
