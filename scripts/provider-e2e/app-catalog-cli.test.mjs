import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatter } from "@lingui/format-po";
import { expect, it } from "vitest";

const cli = fileURLToPath(new URL("./app-catalog-cli.mjs", import.meta.url));
const source = fileURLToPath(new URL("../../src/i18n/locales/en/messages.po", import.meta.url));
const baseline = fileURLToPath(
  new URL("../../src/i18n/locales/zh-Hans/messages.po", import.meta.url),
);
const head = "ed5dc31e70930c8bdb7d3675d208dd99395647d2";
const run = (...args) =>
  JSON.parse(
    execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      killSignal: "SIGKILL",
    }),
  );

it("prepares and stages only new private scratch artifacts, retaining the exact raw bytes", async () => {
  const inputDirectory = await mkdtemp(join(tmpdir(), "lingo-pinned-cli-test-"));
  const outputs = [inputDirectory];
  const source = join(inputDirectory, "en.po");
  const baseline = join(inputDirectory, "zh-Hans.po");
  for (const [locale, path] of [
    ["en", source],
    ["zh-Hans", baseline],
  ]) {
    const content = execFileSync(
      "git",
      ["show", `${head}:src/i18n/locales/${locale}/messages.po`],
      {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8",
      },
    );
    await writeFile(path, content, { flag: "wx", mode: 0o600 });
  }
  const original = await readFile(baseline, "utf8");
  try {
    const prepared = run("prepare", source, baseline, head);
    outputs.push(prepared.directory);
    const repeated = run("prepare", source, baseline, head);
    outputs.push(repeated.directory);
    expect(prepared.directory).not.toBe(repeated.directory);
    expect(prepared.directory.includes("/src/")).toBe(false);
    const packetPath = join(prepared.directory, "source-packet.json");
    const packetBytes = await readFile(packetPath, "utf8");
    expect(JSON.parse(packetBytes).status).toBe("source-prepared");
    expect((await stat(packetPath)).mode & 0o777).toBe(0o600);
    const messages = Object.fromEntries(
      Object.entries(formatter({ explicitIdAsDefault: true }).parse(original)).map(
        ([id, entry]) => [id, entry.translation || "翻译演练完成"],
      ),
    );
    const rawPath = join(prepared.directory, "test-only-provider-response.json");
    const rawBytes = `${JSON.stringify(messages, null, 2)}\n`;
    await writeFile(rawPath, rawBytes, { flag: "wx", mode: 0o600 });
    const staged = run("stage", packetPath, rawPath, source, baseline, head);
    outputs.push(staged.directory);
    expect(staged.directory).not.toBe(prepared.directory);
    expect(staged.status).toBe("unreviewed");
    expect(staged.deliveryAllowed).toBe(false);
    expect(await readFile(join(staged.directory, "raw-target.json"), "utf8")).toBe(rawBytes);
    expect(
      JSON.parse(await readFile(join(staged.directory, "candidate.json"), "utf8")).status,
    ).toBe("unreviewed");
    expect(await readFile(packetPath, "utf8")).toBe(packetBytes);
    expect(await readFile(baseline, "utf8")).toBe(original);
  } finally {
    await Promise.all(outputs.map((directory) => rm(directory, { recursive: true })));
  }
}, 30_000);

it("rejects an output path or unexpected CLI arguments", () => {
  expect(() => run("prepare", source, baseline, head, source)).toThrow();
  expect(() => run("unknown")).toThrow();
}, 30_000);
