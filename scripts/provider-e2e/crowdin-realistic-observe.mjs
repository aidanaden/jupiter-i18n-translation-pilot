import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as z from "zod/v4-mini";

import { collectIncrementalSnapshot } from "./crowdin-incremental-read.mjs";

try {
  const [outputPath] = z.parse(z.tuple([z.string().check(z.minLength(1))]), process.argv.slice(2));
  z.parse(
    z.object({
      GITHUB_EVENT_NAME: z.literal("push"),
      GITHUB_REPOSITORY: z.literal("aidanaden/jupiter-i18n-translation-pilot"),
      GITHUB_REF: z.literal("refs/heads/codex/crowdin-realistic-delivery-20260911"),
      GITHUB_WORKFLOW_REF: z.literal(
        "aidanaden/jupiter-i18n-translation-pilot/.github/workflows/crowdin-incremental-evidence.yml@refs/heads/codex/crowdin-realistic-delivery-20260911",
      ),
    }),
    process.env,
  );
  const snapshot = await collectIncrementalSnapshot({ token: process.env.CROWDIN_PERSONAL_TOKEN });
  const output = resolve(outputPath);
  await mkdir(output, { mode: 0o700 });
  await writeFile(resolve(output, "snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  const state = snapshot.first;
  const added = state.strings.filter((entry) => entry.identifier.startsWith("swap.form."));
  const ids = new Set(added.map((entry) => entry.id));
  const summary = {
    observedAt: snapshot.completedAt,
    fileId: state.file.id,
    revision: state.file.revisionId,
    newSources: added.length,
    newTranslations: state.translations.filter((entry) => ids.has(entry.stringId)).length,
    newApprovals: state.approvals.filter((entry) => ids.has(entry.stringId)).length,
    deliveryAllowed: false,
    humanApprovalProved: false,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch {
  process.stderr.write("Read-only observation failed. No delivery authorization was issued.\n");
  process.exitCode = 1;
}
