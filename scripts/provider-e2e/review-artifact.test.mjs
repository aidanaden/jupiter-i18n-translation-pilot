import { readFile } from "node:fs/promises";

import { formatter } from "@lingui/format-po";
import { expect, it } from "vitest";

import { createReviewArtifact, verifyReviewArtifact } from "./review-artifact.mjs";

async function livePacket() {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const sourcePo = await read("./live-lingo/locales/en.po");
  const rawTargetJson = await read("./live-lingo-json/locales/zh-Hans.json");
  return {
    attempt: "lingo-live-0001",
    gitHead: "a".repeat(40),
    runId: 123,
    runAttempt: 1,
    sourcePo,
    targetPo: await read("./live-lingo-json/derived/zh-Hans.po"),
    rawTargetPo: await read("./live-lingo-json/derived/zh-Hans.po"),
    rawTargetJson,
    glossaryText: '{"terms":[]}',
    engineConfigText: '{"engine":"eng_s8sAdrF2lrMnWj94r7kd"}',
  };
}

it("checks the current live draft without permitting delivery", async () => {
  const packet = await livePacket();
  const artifact = createReviewArtifact(packet);
  expect(artifact.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(artifact.deliveryAllowed).toBe(false);
  expect(
    verifyReviewArtifact(packet, artifact.digest, {
      gitHead: packet.gitHead,
      runId: packet.runId,
      runAttempt: packet.runAttempt,
    }),
  ).toEqual({ digest: artifact.digest, status: "integrity-verified", deliveryAllowed: false });
});

it.each([
  ["attempt", "lingo-live-0002"],
  ["gitHead", "b".repeat(40)],
  ["runId", 124],
  ["runAttempt", 2],
  ["sourcePo", null],
  ["targetPo", null],
  ["rawTargetPo", null],
  ["rawTargetJson", null],
  ["glossaryText", null],
  ["engineConfigText", null],
])("rejects changed %s against the original digest", async (field, value) => {
  const packet = await livePacket();
  const { digest } = createReviewArtifact(packet);
  const changed = { ...packet, [field]: value ?? `${packet[field]}\n` };
  expect(() =>
    verifyReviewArtifact(changed, digest, {
      gitHead: changed.gitHead,
      runId: changed.runId,
      runAttempt: changed.runAttempt,
    }),
  ).toThrow();
});

it("permits a review correction only with a new digest while preserving the AI draft", async () => {
  const packet = await livePacket();
  const po = formatter({ explicitIdAsDefault: true });
  const catalog = po.parse(packet.targetPo);
  catalog["swap.submit"].translation = "确认兑换";
  const corrected = {
    ...packet,
    targetPo: po.serialize(catalog, { locale: "zh-Hans", sourceLocale: "en" }),
  };
  const original = createReviewArtifact(packet);
  const revised = createReviewArtifact(corrected);
  const expectedRun = {
    gitHead: packet.gitHead,
    runId: packet.runId,
    runAttempt: packet.runAttempt,
  };
  expect(revised.digest).not.toBe(original.digest);
  expect(() => verifyReviewArtifact(corrected, original.digest, expectedRun)).toThrow();
  expect(verifyReviewArtifact(corrected, revised.digest, expectedRun).deliveryAllowed).toBe(false);
  expect(() => createReviewArtifact({ ...corrected, rawTargetPo: corrected.targetPo })).toThrow();
});

it.each([
  ["gitHead", "b".repeat(40)],
  ["runId", 124],
  ["runAttempt", 2],
])("rejects independently supplied wrong %s", async (field, value) => {
  const packet = await livePacket();
  const { digest } = createReviewArtifact(packet);
  expect(() =>
    verifyReviewArtifact(packet, digest, {
      gitHead: packet.gitHead,
      runId: packet.runId,
      runAttempt: packet.runAttempt,
      [field]: value,
    }),
  ).toThrow();
});

it.each(["0".repeat(64), "not-a-digest", "", null])(
  "rejects wrong or malformed digest %s",
  async (digest) => {
    const packet = await livePacket();
    expect(() =>
      verifyReviewArtifact(packet, digest, {
        gitHead: packet.gitHead,
        runId: packet.runId,
        runAttempt: packet.runAttempt,
      }),
    ).toThrow();
  },
);

it.each([
  ["attempt", ""],
  ["gitHead", "main"],
  ["gitHead", "A".repeat(40)],
  ["runId", 0],
  ["runId", 1.5],
  ["runId", Number.MAX_SAFE_INTEGER + 1],
  ["runAttempt", -1],
  ["runAttempt", "1"],
  ["engineConfigText", " "],
  ["unknownField", true],
])("rejects malformed metadata %s=%s", async (field, value) => {
  const packet = await livePacket();
  expect(() => createReviewArtifact({ ...packet, [field]: value })).toThrow();
});

it.each(["{}", '{"terms":null}', '{"terms":[{"source":"SOL"}]}', "not-json"])(
  "rejects malformed glossary %s",
  async (glossaryText) => {
    const packet = await livePacket();
    expect(() => createReviewArtifact({ ...packet, glossaryText })).toThrow();
  },
);

it("rejects invalid raw JSON", async () => {
  const packet = await livePacket();
  expect(() => createReviewArtifact({ ...packet, rawTargetJson: "{" })).toThrow();
});

it("rejects a missing placeholder in the raw translation", async () => {
  const packet = await livePacket();
  const raw = JSON.parse(packet.rawTargetJson);
  raw["swap.fee"] = "Network fee SOL";
  expect(() => createReviewArtifact({ ...packet, rawTargetJson: JSON.stringify(raw) })).toThrow();
});

it("rejects valid but different raw and PO translations", async () => {
  const packet = await livePacket();
  const raw = JSON.parse(packet.rawTargetJson);
  raw["swap.submit"] = "Different translation";
  expect(() => createReviewArtifact({ ...packet, rawTargetJson: JSON.stringify(raw) })).toThrow();
});

it("accepts changed POT metadata as equivalent content but invalidates its digest", async () => {
  const packet = await livePacket();
  const changed = {
    ...packet,
    targetPo: packet.targetPo.replace(
      /POT-Creation-Date: [^\\]+/,
      "POT-Creation-Date: 2020-01-01 00:00+0000",
    ),
  };
  const original = createReviewArtifact(packet);
  expect(createReviewArtifact(changed).digest).not.toBe(original.digest);
  expect(() =>
    verifyReviewArtifact(changed, original.digest, {
      gitHead: packet.gitHead,
      runId: packet.runId,
      runAttempt: packet.runAttempt,
    }),
  ).toThrow();
});
