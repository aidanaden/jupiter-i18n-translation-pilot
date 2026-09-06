import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createAppSourcePacket, stageAppCandidate } from "./app-catalog.mjs";

async function main(args) {
  const [command, ...paths] = args;
  let artifact;
  let files;
  if (command === "prepare" && paths.length === 3) {
    const [sourcePath, baselinePath, gitHead] = paths;
    const [sourcePo, baselineTargetPo] = await Promise.all(
      [sourcePath, baselinePath].map((path) => readFile(path, "utf8")),
    );
    artifact = createAppSourcePacket({ sourcePo, baselineTargetPo, gitHead });
    files = {
      "source-packet.json": JSON.stringify(artifact, null, 2),
      "source.json": JSON.stringify(artifact.sourceJson, null, 2),
    };
  } else if (command === "stage" && paths.length === 5) {
    const [packetPath, rawPath, sourcePath, baselinePath, expectedGitHead] = paths;
    const [packetText, rawTargetJson, currentSourcePo, currentBaselineTargetPo] = await Promise.all(
      [packetPath, rawPath, sourcePath, baselinePath].map((path) => readFile(path, "utf8")),
    );
    artifact = stageAppCandidate({
      sourcePacket: JSON.parse(packetText),
      rawTargetJson,
      currentSourcePo,
      currentBaselineTargetPo,
      expectedGitHead,
    });
    files = {
      "candidate.json": JSON.stringify(artifact, null, 2),
      "candidate.po": artifact.candidatePo,
      "raw-target.json": artifact.rawTargetJson,
    };
  } else {
    throw new Error(
      "Usage: app-catalog-cli.mjs prepare SOURCE_PO BASELINE_PO GIT_HEAD | stage PACKET_JSON RAW_JSON SOURCE_PO BASELINE_PO GIT_HEAD. Output is a new private temporary directory.",
    );
  }
  const scratch = await realpath(tmpdir());
  const repository = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  const fromRepository = relative(repository, scratch);
  if (fromRepository !== ".." && !fromRepository.startsWith("../") && !isAbsolute(fromRepository))
    throw new Error("Temporary output must be outside the repository");
  const directory = await mkdtemp(join(scratch, `jupiter-lingo-app-${command}-`));
  for (const [name, bytes] of Object.entries(files))
    await writeFile(join(directory, name), bytes, { flag: "wx", mode: 0o600 });
  process.stdout.write(
    `${JSON.stringify({ directory, status: artifact.status, deliveryAllowed: false })}\n`,
  );
}

await main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
