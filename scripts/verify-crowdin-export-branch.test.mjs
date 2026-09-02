import { describe, expect, test, vi } from "vitest";

import { verifyCrowdinExportBranch } from "./verify-crowdin-export-branch.mjs";

const environment = {
  CROWDIN_BRANCH_ID: "42",
  CROWDIN_BRANCH_NAME: "main",
  CROWDIN_PERSONAL_TOKEN: "secret-token",
  CROWDIN_PROJECT_ID: "923331",
};

describe("verifyCrowdinExportBranch", () => {
  test("accepts one live branch with the configured name and ID", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ data: { id: 42, name: "main" } }],
      }),
    );

    await expect(verifyCrowdinExportBranch({ environment, fetch })).resolves.toEqual({
      id: 42,
      name: "main",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.crowdin.com/api/v2/projects/923331/branches?limit=500&offset=0",
      { headers: { Authorization: "Bearer secret-token" } },
    );
  });

  test("rejects an unverified branch name before calling Crowdin", async () => {
    const fetch = vi.fn();

    await expect(
      verifyCrowdinExportBranch({
        environment: { ...environment, CROWDIN_BRANCH_NAME: "" },
        fetch,
      }),
    ).rejects.toThrow("CROWDIN_BRANCH_NAME");
    expect(fetch).not.toHaveBeenCalled();
  });

  test("rejects a configured branch that does not match the live ID and name", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ data: { id: 43, name: "main" } }],
      }),
    );

    await expect(verifyCrowdinExportBranch({ environment, fetch })).rejects.toThrow(
      "Crowdin branch main with ID 42 was not found exactly once",
    );
  });
});
