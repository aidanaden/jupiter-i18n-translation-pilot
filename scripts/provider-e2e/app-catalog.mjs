import { createHash } from "node:crypto";

import { formatter } from "@lingui/format-po";
import * as z from "zod/v4-mini";

import { lingoJsonToPo, poToLingoJson } from "./lingo-json.mjs";
import { validateCatalogs } from "./offline-runner.mjs";

const po = formatter({ explicitIdAsDefault: true });
const textSchema = z.string().check(z.minLength(1), z.regex(/\S/));
const headSchema = z.string().check(z.regex(/^[a-f0-9]{40}$/));
const hashSchema = z.string().check(z.regex(/^[a-f0-9]{64}$/));
const sourceInputSchema = z.strictObject({
  sourcePo: textSchema,
  baselineTargetPo: textSchema,
  gitHead: headSchema,
});
const sourcePacketSchema = z.extend(sourceInputSchema, {
  status: z.literal("source-prepared"),
  sourceJson: z.record(z.string(), textSchema),
  hashes: z.strictObject({
    sourcePo: hashSchema,
    baselineTargetPo: hashSchema,
    sourceJson: hashSchema,
  }),
  disclosure: z.strictObject({
    commentsSent: z.literal(false),
    glossaryConfigured: z.literal(false),
  }),
  digest: hashSchema,
});
const stageInputSchema = z.strictObject({
  sourcePacket: sourcePacketSchema,
  rawTargetJson: textSchema,
  currentSourcePo: textSchema,
  currentBaselineTargetPo: textSchema,
  expectedGitHead: headSchema,
});

function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function createAppSourcePacket(input) {
  const { sourcePo, baselineTargetPo, gitHead } = z.parse(sourceInputSchema, input);
  const sourceJson = poToLingoJson(sourcePo, { expectedMessageCount: 13 });
  const baseline = po.parse(baselineTargetPo);
  if (
    !baselineTargetPo.includes('"Language: zh-Hans\\n"') ||
    [...baselineTargetPo.matchAll(/^msgid /gm)].length !== 14 ||
    Object.keys(baseline).length !== 13 ||
    JSON.stringify(Object.keys(baseline).sort()) !==
      JSON.stringify(Object.keys(sourceJson).sort()) ||
    Object.entries(baseline).some(([id, entry]) => entry.obsolete || entry.translation === id)
  )
    throw new Error("Expected the 13-message Chinese app baseline with matching IDs");
  validateCatalogs({
    sourcePo,
    targetPo: po.serialize(
      Object.fromEntries(
        Object.entries(baseline).map(([id, entry]) => [
          id,
          { ...entry, translation: entry.translation || sourceJson[id] },
        ]),
      ),
      { locale: "zh-Hans", sourceLocale: "en" },
    ),
    glossary: { terms: [] },
  });
  const packet = {
    sourcePo,
    baselineTargetPo,
    gitHead,
    status: "source-prepared",
    sourceJson: Object.freeze(sourceJson),
    hashes: Object.freeze({
      sourcePo: digest(sourcePo),
      baselineTargetPo: digest(baselineTargetPo),
      sourceJson: digest(JSON.stringify(sourceJson)),
    }),
    disclosure: Object.freeze({ commentsSent: false, glossaryConfigured: false }),
  };
  return Object.freeze({ ...packet, digest: digest(JSON.stringify(["app-source-v1", packet])) });
}

export function stageAppCandidate(input) {
  const { sourcePacket, rawTargetJson, currentSourcePo, currentBaselineTargetPo, expectedGitHead } =
    z.parse(stageInputSchema, input);
  const expectedPacket = createAppSourcePacket({
    sourcePo: currentSourcePo,
    baselineTargetPo: currentBaselineTargetPo,
    gitHead: expectedGitHead,
  });
  if (JSON.stringify(sourcePacket) !== JSON.stringify(expectedPacket))
    throw new Error("The source packet differs from the current source, baseline, or Git head");
  const candidatePo = lingoJsonToPo(sourcePacket.sourcePo, JSON.parse(rawTargetJson), {
    expectedMessageCount: 13,
  });
  return Object.freeze({
    status: "unreviewed",
    deliveryAllowed: false,
    sourceDigest: sourcePacket.digest,
    rawTargetJson,
    candidatePo,
    hashes: Object.freeze({
      rawTargetJson: digest(rawTargetJson),
      candidatePo: digest(candidatePo),
    }),
  });
}
