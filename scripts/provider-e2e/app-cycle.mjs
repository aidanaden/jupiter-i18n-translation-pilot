import { createHash } from "node:crypto";

import * as z from "zod/v4-mini";

import { createAppSourcePacket } from "./app-catalog.mjs";
import { poToLingoJson } from "./lingo-json.mjs";
import { validateCatalogs } from "./offline-runner.mjs";

const targetPath = "src/i18n/locales/zh-Hans/messages.po";
const sha = z.string().check(z.regex(/^[a-f0-9]{40}$/));
const hash = z.string().check(z.regex(/^[a-f0-9]{64}$/));
const text = z.string().check(z.minLength(1));
const refs = {
  repository: z.literal("aidanaden/jupiter-i18n-translation-pilot"),
  baseBranch: z.literal("aidan/provider-e2e-lingo-base"),
  runId: z.string().check(z.regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/)),
  attempt: z.literal(1),
  sourceSha: sha,
  baseSha: sha,
  acceptedSha: sha,
};
const snapshotInput = z.strictObject({
  ...refs,
  sourcePo: text,
  baselineTargetPo: text,
  acceptedTargetPo: text,
});
const authority = {
  evidence: "data-integrity-only",
  humanApprovalProved: false,
  liveStateProved: false,
  providerRequestAllowed: false,
  deliveryAllowed: false,
  mergeAllowed: false,
  deploymentAllowed: false,
};

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createAppCycleSnapshot(input) {
  const data = z.parse(snapshotInput, input);
  createAppSourcePacket({
    sourcePo: data.sourcePo,
    baselineTargetPo: data.baselineTargetPo,
    gitHead: data.baseSha,
  });
  validateCatalogs({
    sourcePo: data.sourcePo,
    targetPo: data.acceptedTargetPo,
    glossary: { terms: [] },
  });
  if (data.acceptedSha === data.baseSha || data.acceptedTargetPo === data.baselineTargetPo)
    throw new Error("Expected a run-owned catalog change at a new accepted head");
  const snapshot = {
    ...data,
    status: "cycle-snapshot",
    ...authority,
    hashes: Object.freeze({
      sourcePo: digest(data.sourcePo),
      baselineTargetPo: digest(data.baselineTargetPo),
      acceptedTargetPo: digest(data.acceptedTargetPo),
    }),
  };
  return Object.freeze({ ...snapshot, digest: digest(JSON.stringify(["app-cycle-v1", snapshot])) });
}

function verify(input, allowNextSource) {
  const parsed = z.parse(
    z.strictObject({
      snapshot: z.unknown(),
      expected: z.strictObject({ ...refs, digest: hash }),
      current: z.strictObject({
        head: sha,
        sourcePo: text,
        targetPo: text,
        changedPaths: z.tuple([z.literal(targetPath)]),
      }),
      ...(allowNextSource ? { nextSourcePo: z.optional(text) } : {}),
    }),
    input,
  );
  const original = parsed.snapshot;
  if (!original || typeof original !== "object") throw new Error("Missing cycle snapshot");
  const data = Object.fromEntries(
    Object.keys(snapshotInput.shape).map((key) => [key, original[key]]),
  );
  const snapshot = createAppCycleSnapshot(data);
  if (JSON.stringify(original) !== JSON.stringify(snapshot))
    throw new Error("Cycle snapshot integrity differs");
  for (const [key, value] of Object.entries(parsed.expected)) {
    if (snapshot[key] !== value) throw new Error(`Cycle expected ${key} differs`);
  }
  if (parsed.current.head !== snapshot.acceptedSha)
    throw new Error("Current head differs from the run-owned accepted head");
  if (parsed.current.sourcePo !== snapshot.sourcePo)
    throw new Error("Current source differs from the run baseline");
  if (parsed.current.targetPo !== snapshot.acceptedTargetPo)
    throw new Error("Current target differs from the run-owned accepted catalog");
  return { ...parsed, snapshot };
}

export function planAppCycleSync(input) {
  const { snapshot, nextSourcePo } = verify(input, true);
  const changed = nextSourcePo !== undefined && nextSourcePo !== snapshot.sourcePo;
  if (changed) poToLingoJson(nextSourcePo, { expectedMessageCount: 13 });
  return Object.freeze({
    status: changed ? "review-required" : "no-op",
    ...authority,
    snapshotDigest: snapshot.digest,
    acceptedTargetHash: snapshot.hashes.acceptedTargetPo,
    proposedSourceHash: digest(nextSourcePo ?? snapshot.sourcePo),
    changedPaths: Object.freeze([]),
    targetPreserved: true,
  });
}

export function planAppCycleReset(input) {
  const { snapshot } = verify(input, false);
  return Object.freeze({
    status: "protected-reset-pr-required",
    ...authority,
    snapshotDigest: snapshot.digest,
    expectedHead: snapshot.acceptedSha,
    changedPaths: Object.freeze([targetPath]),
    baselineTargetPo: snapshot.baselineTargetPo,
    baselineTargetHash: snapshot.hashes.baselineTargetPo,
  });
}
