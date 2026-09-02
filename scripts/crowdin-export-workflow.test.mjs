import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const WORKFLOW_PATH = new URL("../.github/workflows/crowdin-export.yml", import.meta.url);

describe("Crowdin export workflow", () => {
  test("exports approved Chinese translations through a pinned Action", async () => {
    const workflow = await readFile(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain('cron: "17 * * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("crowdin/github-action@71fdb8814261dd703be4ca7c6450d21b1868da4b");
    expect(workflow).toContain("upload_sources: false");
    expect(workflow).toContain("upload_translations: false");
    expect(workflow).toContain("download_translations: true");
    expect(workflow).toContain("download_language: zh-CN");
    expect(workflow).toContain("export_only_approved: true");
    expect(workflow).toContain("skip_untranslated_strings: true");
    expect(workflow).toContain("push_translations: true");
    expect(workflow).toContain("localization_branch_name: l10n");
    expect(workflow).toContain("create_pull_request: true");
    expect(workflow).toContain("pull_request_base_branch_name: main");
    expect(workflow).toContain("crowdin_branch_name: ${{ vars.CROWDIN_BRANCH_NAME }}");
    expect(workflow).toContain("CROWDIN_PROJECT_ID: ${{ secrets.CROWDIN_PROJECT_ID }}");
    expect(workflow).toContain("CROWDIN_PERSONAL_TOKEN: ${{ secrets.CROWDIN_PERSONAL_TOKEN }}");
    expect(workflow).toContain("GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });

  test("stops before export when the live Crowdin branch is not configured", async () => {
    const workflow = await readFile(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("CROWDIN_BRANCH_NAME: ${{ vars.CROWDIN_BRANCH_NAME }}");
    expect(workflow).toContain('test -n "$CROWDIN_BRANCH_NAME"');
  });
});
