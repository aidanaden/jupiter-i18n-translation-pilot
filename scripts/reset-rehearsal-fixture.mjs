import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { formatter } from "@lingui/format-po";

import {
  REHEARSAL_BASELINE,
  REHEARSAL_FIXTURE,
  REHEARSAL_RESET_PATHS,
} from "./rehearsal-baseline.mjs";

const poFormatter = formatter({ explicitIdAsDefault: true, lineNumbers: false });

const mode = process.argv[2];
assert.ok(
  ["--check", "--verify-plan", "--write"].includes(mode),
  "Use --check, --verify-plan, or --write",
);

const baselineCommit = readGit(["rev-parse", `${REHEARSAL_BASELINE.tag}^{commit}`]);
assert.equal(
  baselineCommit,
  REHEARSAL_BASELINE.commit,
  `${REHEARSAL_BASELINE.tag} does not point to the reviewed rehearsal baseline`,
);

if (mode === "--verify-plan") {
  const changedSourcePaths = readGit(["diff", "--name-only", REHEARSAL_BASELINE.tag, "--", "src"])
    .split("\n")
    .filter(Boolean);
  const uncoveredPaths = changedSourcePaths.filter((path) => !REHEARSAL_RESET_PATHS.includes(path));
  assert.deepEqual(
    uncoveredPaths,
    [],
    `The reset plan does not cover these fixture source paths: ${uncoveredPaths.join(", ")}`,
  );
  const sourceTreeHash = createHash("sha256");
  for (const path of REHEARSAL_RESET_PATHS) {
    sourceTreeHash.update(path);
    sourceTreeHash.update("\0");
    sourceTreeHash.update(normalizeFixtureContent(path, await readFile(path, "utf8")));
    sourceTreeHash.update("\0");
  }
  assert.equal(
    sourceTreeHash.digest("hex"),
    REHEARSAL_BASELINE.sourceTreeSha256,
    "The source fixture content differs from the reviewed fixture",
  );
  console.log(`Reset plan covers ${REHEARSAL_RESET_PATHS.length} fixture paths.`);
  process.exit(0);
}

if (mode === "--write") {
  assert.equal(
    readGit(["status", "--porcelain"]),
    "",
    "The working tree must be clean before reset",
  );
  for (const path of REHEARSAL_RESET_PATHS) {
    const baselineContent = execFileSync("git", ["show", `${REHEARSAL_BASELINE.tag}:${path}`], {
      encoding: "utf8",
    });
    await writeFile(path, baselineContent);
  }
  console.log("Restored the rehearsal fixture paths. Review, verify, and commit the reset.");
  process.exit(0);
}

const mismatchedPaths = [];
for (const path of REHEARSAL_RESET_PATHS) {
  const baselineContent = execFileSync("git", ["show", `${REHEARSAL_BASELINE.tag}:${path}`], {
    encoding: "utf8",
  });
  const currentContent = await readFile(path, "utf8");
  if (currentContent !== baselineContent) mismatchedPaths.push(path);
}
assert.deepEqual(
  mismatchedPaths,
  [],
  `The rehearsal reset differs from ${REHEARSAL_BASELINE.tag}: ${mismatchedPaths.join(", ")}`,
);
console.log(`Rehearsal fixture matches ${REHEARSAL_BASELINE.tag}.`);

function readGit(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function normalizeFixtureContent(path, content) {
  if (path === REHEARSAL_FIXTURE.targetCatalogPath) {
    const catalog = poFormatter.parse(content);
    const proofMessage = catalog[REHEARSAL_FIXTURE.messageId];
    assert.ok(proofMessage, `Missing ${REHEARSAL_FIXTURE.messageId} from ${path}`);
    assert.ok(
      ["", REHEARSAL_FIXTURE.target].includes(proofMessage.translation),
      `${REHEARSAL_FIXTURE.messageId} has an unreviewed translation`,
    );

    return JSON.stringify(
      Object.entries(catalog)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, message]) => [
          id,
          id === REHEARSAL_FIXTURE.messageId ? { ...message, translation: "" } : message,
        ]),
    );
  }

  if (path === REHEARSAL_FIXTURE.targetCompiledCatalogPath) {
    const sourceEntry = `"${REHEARSAL_FIXTURE.messageId}":["${REHEARSAL_FIXTURE.source}"]`;
    const targetEntry = `"${REHEARSAL_FIXTURE.messageId}":["${REHEARSAL_FIXTURE.target}"]`;
    assert.ok(
      content.includes(sourceEntry) || content.includes(targetEntry),
      `${REHEARSAL_FIXTURE.messageId} is missing from ${path}`,
    );
    return content.replace(targetEntry, sourceEntry);
  }

  return content;
}
