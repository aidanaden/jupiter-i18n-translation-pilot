import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import {
  parseMaintainerOptions,
  parseGitHubResponse,
  readArtifactPacket,
} from "./maintainer-check-cli.mjs";

it("requires an explicit reviewed local base and bounded final proof IDs", () => {
  const sha = "a".repeat(40);
  expect(parseMaintainerOptions(["preflight", "--trusted-base", sha])).toEqual({
    mode: "preflight",
    trustedBaseSha: sha,
  });
  expect(
    parseMaintainerOptions([
      "verify",
      "--trusted-base",
      sha,
      "--run",
      "123",
      "--artifact",
      "99",
      "--packet-digest",
      "f".repeat(64),
    ]),
  ).toMatchObject({ mode: "verify", runId: 123, artifactId: 99 });
  for (const args of [
    [],
    ["preflight", "--trusted-base", "main"],
    ["verify", "--trusted-base", sha],
    ["preflight", "--trusted-base", sha, "--token", "bad"],
    ["preflight", "--trusted-base", sha, "--trusted-base", sha],
  ])
    expect(() => parseMaintainerOptions(args)).toThrow();
});

it("rejects API failures, pagination, and oversized JSON", () => {
  expect(
    parseGitHubResponse('HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n{"ok":true}'),
  ).toEqual({ ok: true });
  expect(() => parseGitHubResponse("HTTP/2.0 403 Forbidden\r\n\r\n{}")).toThrow();
  expect(() =>
    parseGitHubResponse(
      'HTTP/2.0 200 OK\r\nLink: <https://api.github.com/next>; rel="next"\r\n\r\n{}',
    ),
  ).toThrow();
  expect(() => parseGitHubResponse("HTTP/2.0 200 OK\r\n\r\n" + " ".repeat(2000001))).toThrow();
});

it("rejects invalid or unsafe archives without extracting any path", async () => {
  await expect(readArtifactPacket(Buffer.from("not a ZIP"))).rejects.toThrow();
  await expect(readArtifactPacket(Buffer.alloc(2000001))).rejects.toThrow();
});

it("reads only the two expected artifact entries and returns the ZIP digest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lingo-archive-test-"));
  try {
    await writeFile(join(directory, "packet.json"), JSON.stringify({ test: true }));
    await writeFile(join(directory, "REVIEW.md"), "review");
    execFileSync("zip", ["-q", "packet.zip", "packet.json", "REVIEW.md"], { cwd: directory });
    const bytes = await readFile(join(directory, "packet.zip"));
    expect(await readArtifactPacket(bytes)).toEqual({
      packet: { test: true },
      archiveDigest: createHash("sha256").update(bytes).digest("hex"),
    });
    await writeFile(join(directory, "extra.txt"), "not allowed");
    execFileSync("zip", ["-q", "packet.zip", "extra.txt"], { cwd: directory });
    await expect(readArtifactPacket(await readFile(join(directory, "packet.zip")))).rejects.toThrow(
      "Unexpected artifact paths",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
