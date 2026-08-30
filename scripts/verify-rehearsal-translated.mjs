import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatter } from "@lingui/format-po";

import { REHEARSAL_FIXTURE } from "./rehearsal-baseline.mjs";
import { run, withRehearsalWorktree } from "./rehearsal-worktree.mjs";

const poFormatter = formatter({ explicitIdAsDefault: true, lineNumbers: false });
const pendingEntry = `msgid "${REHEARSAL_FIXTURE.messageId}"\nmsgstr ""`;
const translatedEntry = `msgid "${REHEARSAL_FIXTURE.messageId}"\nmsgstr "${REHEARSAL_FIXTURE.target}"`;

await withRehearsalWorktree("jupiter-rehearsal-translated-", async (worktree) => {
  const targetPath = join(worktree, REHEARSAL_FIXTURE.targetCatalogPath);
  const targetCatalog = await readFile(targetPath, "utf8");
  const proofMessage = poFormatter.parse(targetCatalog)[REHEARSAL_FIXTURE.messageId];
  assert.ok(proofMessage, `Missing ${REHEARSAL_FIXTURE.messageId} from the target catalog`);
  if (proofMessage.translation === "") {
    assert.ok(targetCatalog.includes(pendingEntry), "The untranslated fixture entry is malformed");
    await writeFile(targetPath, targetCatalog.replace(pendingEntry, translatedEntry));
  } else {
    assert.equal(
      proofMessage.translation,
      REHEARSAL_FIXTURE.target,
      "The rehearsal target differs from the reviewed fixed translation",
    );
  }

  run("pnpm", ["run", "verify:ssr"], worktree);
  run("node", ["scripts/reset-rehearsal-fixture.mjs", "--verify-plan"], worktree);
  console.log("Reviewed rehearsal translation rendered in Simplified Chinese SSR.");
});
