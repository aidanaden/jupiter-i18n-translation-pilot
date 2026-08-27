import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const port = await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const address = socket.address();
    assert(address && typeof address !== "string");
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
    { locale: "en", marker: "Review swap" },
    { locale: "zh-Hans", marker: "查看兑换" },
    { locale: "en-XA", marker: "Ŕēvĩēŵ śŵàƥ" },
  ];

  for (const { locale, marker } of cases) {
    const response = await fetch(`${baseUrl}/?locale=${locale}&page=swap`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]+lang="${locale}"`));
    assert.ok(html.includes(marker), `${locale} SSR HTML did not contain ${marker}`);
    assert.ok(html.includes("/jupiter-logo.svg"));
    assert.ok(html.includes("Commit "));
    assert.ok(html.includes("Catalog "));
  }

  console.log("SSR preview verified for en, zh-Hans, and en-XA.");
} finally {
  preview.kill("SIGTERM");
}
