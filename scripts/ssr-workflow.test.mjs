import { readFile } from "node:fs/promises";

import { expect, it } from "vitest";
import { parse } from "yaml";

it("isolates only Lingo base PR checks and retains common and Crowdin verification", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );
  const steps = workflow.jobs.verify.steps;
  const isolated = steps.filter((step) => step.if?.includes("== 'aidan/provider-e2e-lingo-base'"));
  expect(isolated.map((step) => step.run)).toEqual([
    "pnpm run verify:ssr:lingo-e2e",
    "pnpm run verify:lingo-e2e:dry-run",
  ]);
  for (const step of isolated) {
    expect(step.if).toBe(
      "github.event_name == 'pull_request' && github.base_ref == 'aidan/provider-e2e-lingo-base'",
    );
  }
  const legacy = steps.filter((step) => step.if?.includes("!= 'aidan/provider-e2e-lingo-base'"));
  expect(legacy.map((step) => step.run)).toEqual([
    "pnpm run verify:ssr",
    "pnpm run verify:rehearsal-reset-plan",
    "pnpm run verify:rehearsal-reset-execution",
    "pnpm run verify:rehearsal-translated",
    "pnpm run deploy:dry-run",
  ]);
  for (const step of legacy) {
    expect(step.if).toBe(
      "github.event_name != 'pull_request' || github.base_ref != 'aidan/provider-e2e-lingo-base'",
    );
  }
  const shared = steps.filter((step) => !step.if).map((step) => step.run);
  expect(shared).toEqual(
    expect.arrayContaining([
      "pnpm run format:check",
      "pnpm run lint:check",
      "pnpm run typecheck",
      "pnpm run test",
      "pnpm run i18n:sync",
      "pnpm run scheduler:deploy:dry-run",
    ]),
  );
  expect(shared.some((command) => command?.startsWith("git diff --exit-code -- ."))).toBe(true);
  expect(steps.some((step) => step["continue-on-error"])).toBe(false);
});
