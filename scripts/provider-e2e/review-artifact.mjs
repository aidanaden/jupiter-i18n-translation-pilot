import { createHash } from "node:crypto";

import { formatter } from "@lingui/format-po";
import * as z from "zod/v4-mini";

import { lingoJsonToPo } from "./lingo-json.mjs";
import { validateCatalogs } from "./offline-runner.mjs";

const textSchema = z.string().check(z.minLength(1), z.regex(/\S/));
const runSchema = z.strictObject({
  gitHead: z.string().check(z.regex(/^[a-f0-9]{40}$/)),
  runId: z.number().check(z.int(), z.positive()),
  runAttempt: z.number().check(z.int(), z.positive()),
});
const packetSchema = z.extend(runSchema, {
  attempt: z.string().check(z.regex(/^[a-z0-9-]{8,80}$/)),
  sourcePo: textSchema,
  targetPo: textSchema,
  rawTargetPo: textSchema,
  rawTargetJson: textSchema,
  glossaryText: textSchema,
  engineConfigText: textSchema,
});
const glossarySchema = z.strictObject({
  revision: z.optional(textSchema),
  status: z.optional(textSchema),
  locale: z.optional(z.literal("zh-Hans")),
  terms: z.array(
    z.strictObject({
      source: textSchema,
      target: textSchema,
      ids: z.array(textSchema).check(z.minLength(1)),
    }),
  ),
});

export function createReviewArtifact(input) {
  const packet = z.parse(packetSchema, input);
  const glossary = z.parse(glossarySchema, JSON.parse(packet.glossaryText));
  const parse = formatter({ explicitIdAsDefault: true }).parse;
  if (
    JSON.stringify(parse(lingoJsonToPo(packet.sourcePo, JSON.parse(packet.rawTargetJson)))) !==
    JSON.stringify(parse(packet.rawTargetPo))
  )
    throw new Error("The raw target PO differs from the raw Lingo result");
  validateCatalogs({
    sourcePo: packet.sourcePo,
    targetPo: packet.rawTargetPo,
    glossary: { terms: [] },
  });
  validateCatalogs({ sourcePo: packet.sourcePo, targetPo: packet.targetPo, glossary });
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "provider-review-artifact-v1",
        packet.attempt,
        packet.gitHead,
        packet.runId,
        packet.runAttempt,
        packet.sourcePo,
        packet.targetPo,
        packet.rawTargetPo,
        packet.rawTargetJson,
        packet.glossaryText,
        packet.engineConfigText,
      ]),
    )
    .digest("hex");
  return { digest, status: "integrity-created", deliveryAllowed: false };
}

export function verifyReviewArtifact(input, expectedDigest, expectedRun) {
  const expected = z.parse(runSchema, expectedRun);
  const digest = z.parse(z.string().check(z.regex(/^[a-f0-9]{64}$/)), expectedDigest);
  const artifact = createReviewArtifact(input);
  if (
    artifact.digest !== digest ||
    input.gitHead !== expected.gitHead ||
    input.runId !== expected.runId ||
    input.runAttempt !== expected.runAttempt
  )
    throw new Error("The review artifact differs from the expected content or run");
  return { digest, status: "integrity-verified", deliveryAllowed: false };
}
