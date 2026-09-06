import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createAppCycleSnapshot, planAppCycleReset, planAppCycleSync } from "./app-cycle.mjs";

export async function runAppCycleCli(args) {
  const [command, inputPath] = args;
  if (args.length !== 2 || !["snapshot", "sync", "reset"].includes(command))
    throw new Error("Usage: app-cycle-cli.mjs snapshot|sync|reset INPUT_JSON. No live changes.");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const artifact =
    command === "snapshot"
      ? createAppCycleSnapshot(input)
      : command === "sync"
        ? planAppCycleSync(input)
        : planAppCycleReset(input);
  const scratch = await realpath(tmpdir());
  const repository = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  const fromRepository = relative(repository, scratch);
  if (fromRepository !== ".." && !fromRepository.startsWith("../") && !isAbsolute(fromRepository))
    throw new Error("Temporary output must be outside the repository");
  const directory = await mkdtemp(join(scratch, `jupiter-lingo-cycle-${command}-`));
  await writeFile(join(directory, `${command}.json`), JSON.stringify(artifact, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  if (command === "reset")
    await writeFile(join(directory, "baseline-target.po"), artifact.baselineTargetPo, {
      flag: "wx",
      mode: 0o600,
    });
  return { directory, status: artifact.status, mergeAllowed: false, deploymentAllowed: false };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runAppCycleCli(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
