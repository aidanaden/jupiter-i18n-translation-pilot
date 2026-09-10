import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";

import { formatter } from "@lingui/format-po";
import { Window } from "happy-dom";
import * as z from "zod/v4-mini";

const sources = {
  "swap.form.balance": "Balance {balance}",
  "swap.form.limit": "Limit",
  "swap.form.market": "Market",
  "swap.form.pay": "You pay",
  "swap.form.receive": "You receive",
  "swap.form.recurring": "Recurring",
};

export function verifyPrivateSwapHtml({ html, locale, englishCatalog, targetCatalog }) {
  assert.ok(locale === "en" || locale === "zh-Hans", "Unexpected locale");
  const po = formatter({ explicitIdAsDefault: true });
  const english = po.parse(englishCatalog);
  const target = po.parse(targetCatalog);
  const blankCount = Object.keys(sources).filter((id) => target[id]?.translation === "").length;
  assert.ok(blankCount === 0 || blankCount === 6, "Expected six blank or six translated labels");
  const window = new Window();
  const document = new window.DOMParser().parseFromString(html, "text/html");
  assert.equal(document.documentElement.lang, locale);
  document.querySelectorAll("script, style").forEach((element) => element.remove());
  const text = document.body.textContent;
  for (const [id, source] of Object.entries(sources)) {
    assert.equal(english[id]?.translation, source, `${id}: source changed`);
    const entry = target[id];
    assert.ok(
      entry && !entry.obsolete && !entry.extra?.flags?.includes("fuzzy"),
      `${id}: invalid target`,
    );
    const translation = z.parse(z.string(), entry.translation);
    assert.ok(
      translation === "" || (translation.trim() && translation !== source),
      `${id}: target must be blank or translated`,
    );
    const value = locale === "en" ? source : entry.translation || source;
    assert.deepEqual(
      value.match(/\{[^}]*\}/g) ?? [],
      source.match(/\{[^}]*\}/g) ?? [],
      `${id}: placeholder changed`,
    );
    const rendered = value.replace("{balance}", "12.40");
    assert.ok(!/[{}]/.test(rendered), `${id}: malformed placeholder`);
    assert.ok(text.includes(rendered), `${locale}: missing rendered ${id}: ${rendered}`);
    assert.ok(!text.includes(id), `${locale}: untranslated ID ${id}`);
  }
  assert.ok(!text.includes("{balance}"), "Balance placeholder was not rendered");
  const review = target["baseline.swap.review"];
  assert.ok(review && !review.obsolete && !review.extra?.flags?.includes("fuzzy"));
  assert.ok(z.parse(z.string(), review.translation).trim(), "Missing review translation");
  assert.ok(text.includes(locale === "en" ? "Review swap" : review.translation));
}

async function main() {
  assert.equal(process.argv.length, 2, "Usage: node scripts/verify-crowdin-private-ssr.mjs");
  const englishCatalog = await readFile("src/i18n/locales/en/messages.po", "utf8");
  const targetCatalog = await readFile("src/i18n/locales/zh-Hans/messages.po", "utf8");
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
    [
      "exec",
      "wrangler",
      "dev",
      "--config",
      "dist-crowdin-ai-e2e/server/wrangler.json",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  preview.stdout.on("data", (chunk) => {
    output = (output + chunk).slice(-16000);
  });
  preview.stderr.on("data", (chunk) => {
    output = (output + chunk).slice(-16000);
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 45000;
    while (true) {
      try {
        const response = await fetch(`${baseUrl}/?locale=en&page=swap`, {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) break;
      } catch {}
      assert.ok(
        Date.now() < deadline && preview.exitCode === null,
        `Preview did not start: ${output}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    for (const locale of ["en", "zh-Hans"]) {
      const response = await fetch(`${baseUrl}/?locale=${locale}&page=swap`, {
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(response.status, 200);
      verifyPrivateSwapHtml({ html: await response.text(), locale, englishCatalog, targetCatalog });
    }
    console.log(
      "Private Crowdin swap SSR verified for English and Chinese, including all six labels and balance.",
    );
  } finally {
    preview.kill("SIGTERM");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
