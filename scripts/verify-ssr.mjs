import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import * as z from "zod/v4-mini";

import { REHEARSAL_FIXTURE } from "./rehearsal-baseline.mjs";
import { readSsrExpectations } from "./ssr-catalog.mjs";

const args = process.argv.slice(2);
assert.ok(
  args.length === 0 || (args.length === 1 && args[0] === "--lingo-e2e"),
  "Usage: node scripts/verify-ssr.mjs [--lingo-e2e]",
);
const lingoE2e = args[0] === "--lingo-e2e";

const englishCatalog = await readFile("src/i18n/locales/en/messages.po", "utf8");
const simplifiedChineseCatalog = await readFile("src/i18n/locales/zh-Hans/messages.po", "utf8");
const { state: rehearsalState, cases } = readSsrExpectations({
  englishCatalog,
  simplifiedChineseCatalog,
  lingoE2e,
});

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
  lingoE2e
    ? [
        "exec",
        "wrangler",
        "dev",
        "--config",
        "dist-lingo-e2e/server/wrangler.json",
        "--local",
        "--ip",
        "127.0.0.1",
        "--port",
        String(port),
      ]
    : ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
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
