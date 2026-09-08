import { readFile } from "node:fs/promises";

import {
  acceptCrowdinAiCandidate,
  createCrowdinAiBaseline,
  planCrowdinAiRepeatExport,
  planCrowdinAiReset,
  stageCrowdinAiCandidate,
  verifyCrowdinAiReset,
} from "./crowdin-ai-cycle.mjs";

const commands = {
  baseline: createCrowdinAiBaseline,
  stage: stageCrowdinAiCandidate,
  accept: acceptCrowdinAiCandidate,
  repeat: planCrowdinAiRepeatExport,
  "reset-plan": planCrowdinAiReset,
  "verify-reset": verifyCrowdinAiReset,
};

try {
  const [command, inputPath] = process.argv.slice(2);
  if (process.argv.length !== 4 || !Object.hasOwn(commands, command))
    throw new Error(
      "Usage: crowdin-ai-cycle-cli.mjs baseline|stage|accept|repeat|reset-plan|verify-reset INPUT_JSON. No live changes.",
    );
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const result = commands[command](input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
