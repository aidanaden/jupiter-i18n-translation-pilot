import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";
import { parse } from "yaml";

const WORKFLOW_PATH = new URL("../.github/workflows/crowdin-export.yml", import.meta.url);

describe("Crowdin export workflow", () => {
  test("exports approved Chinese translations through one pinned Action step", async () => {
    const workflow = parse(await readFile(WORKFLOW_PATH, "utf8"));

    expect(workflow.on).toEqual({
      schedule: [{ cron: "17 * * * *" }],
      workflow_dispatch: null,
    });
    expect(workflow.permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
    });
    expect(workflow.jobs.export.permissions).toBeUndefined();
    expect(workflow.jobs.export.steps).toEqual([
      { uses: "actions/checkout@v4" },
      { uses: "pnpm/action-setup@v4" },
      {
        uses: "actions/setup-node@v4",
        with: {
          cache: "pnpm",
          "node-version": 22,
        },
      },
      { run: "pnpm install --frozen-lockfile" },
      {
        env: {
          CROWDIN_BRANCH_ID: "${{ vars.CROWDIN_BRANCH_ID }}",
          CROWDIN_BRANCH_NAME: "${{ vars.CROWDIN_BRANCH_NAME }}",
          CROWDIN_PERSONAL_TOKEN: "${{ secrets.CROWDIN_PERSONAL_TOKEN }}",
          CROWDIN_PROJECT_ID: "${{ secrets.CROWDIN_PROJECT_ID }}",
        },
        name: "Verify the live Crowdin branch",
        run: "node scripts/verify-crowdin-export-branch.mjs",
      },
      {
        env: {
          CROWDIN_PERSONAL_TOKEN: "${{ secrets.CROWDIN_PERSONAL_TOKEN }}",
          CROWDIN_PROJECT_ID: "${{ secrets.CROWDIN_PROJECT_ID }}",
          GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
        },
        uses: "crowdin/github-action@71fdb8814261dd703be4ca7c6450d21b1868da4b",
        with: {
          config: "crowdin.yml",
          create_pull_request: true,
          crowdin_branch_name: "${{ vars.CROWDIN_BRANCH_NAME }}",
          download_language: "zh-CN",
          download_translations: true,
          export_only_approved: true,
          localization_branch_name: "l10n",
          pull_request_base_branch_name: "main",
          push_translations: true,
          skip_untranslated_strings: true,
          upload_sources: false,
          upload_translations: false,
        },
      },
    ]);
  });
});
