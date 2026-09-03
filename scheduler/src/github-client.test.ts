import { describe, expect, test, vi } from "vitest";

import { GitHubWorkflowClient } from "./github-client";

describe("GitHub workflow client", () => {
  test("does not require the dispatch token until a GitHub request starts", async () => {
    const fetch = vi.fn();
    const client = new GitHubWorkflowClient({
      fetch,
      owner: "aidanaden",
      ref: "main",
      repository: "jupiter-i18n-translation-pilot",
      token: undefined,
      workflow: "crowdin-export.yml",
    });

    await expect(client.findRun("crowdin-export-1788481020000-attempt-1")).rejects.toThrow(
      "GITHUB_DISPATCH_TOKEN is missing",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test("dispatches the Crowdin workflow with a stable scheduler ID", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        html_url: "https://github.test/runs/42",
        run_url: "https://api.github.test/runs/42",
        workflow_run_id: 42,
      }),
    );
    const client = new GitHubWorkflowClient({
      fetch,
      owner: "aidanaden",
      ref: "main",
      repository: "jupiter-i18n-translation-pilot",
      token: "test-token",
      workflow: "crowdin-export.yml",
    });

    await expect(
      client.dispatch({
        dispatchId: "crowdin-export-1788481020000-attempt-1",
        scheduledFor: "2026-09-04T00:17:00.000Z",
      }),
    ).resolves.toEqual({ id: 42, url: "https://github.test/runs/42" });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/aidanaden/jupiter-i18n-translation-pilot/actions/workflows/crowdin-export.yml/dispatches",
      {
        body: JSON.stringify({
          inputs: {
            dispatch_id: "crowdin-export-1788481020000-attempt-1",
            scheduled_for: "2026-09-04T00:17:00.000Z",
          },
          ref: "main",
          return_run_details: true,
        }),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        method: "POST",
      },
    );
  });

  test("rejects an empty dispatch response so the scheduler can adopt the run", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new GitHubWorkflowClient({
      fetch,
      owner: "aidanaden",
      ref: "main",
      repository: "jupiter-i18n-translation-pilot",
      token: "test-token",
      workflow: "crowdin-export.yml",
    });

    await expect(
      client.dispatch({
        dispatchId: "crowdin-export-1788481020000-attempt-1",
        scheduledFor: "2026-09-04T00:17:00.000Z",
      }),
    ).rejects.toThrow("GitHub workflow dispatch response is invalid");
  });

  test("finds an accepted dispatch by its exact run title", async () => {
    const dispatchId = "crowdin-export-1788481020000-attempt-1";
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        workflow_runs: [
          {
            display_title: `Crowdin export [${dispatchId}]`,
            html_url: "https://github.test/runs/42",
            id: 42,
          },
          {
            display_title: "Crowdin export [another-dispatch]",
            html_url: "https://github.test/runs/41",
            id: 41,
          },
        ],
      }),
    );
    const client = new GitHubWorkflowClient({
      fetch,
      owner: "aidanaden",
      ref: "main",
      repository: "jupiter-i18n-translation-pilot",
      token: "test-token",
      workflow: "crowdin-export.yml",
    });

    await expect(client.findRun(dispatchId)).resolves.toEqual({
      id: 42,
      url: "https://github.test/runs/42",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/aidanaden/jupiter-i18n-translation-pilot/actions/workflows/crowdin-export.yml/runs?branch=main&event=workflow_dispatch&per_page=30",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer test-token",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        method: "GET",
      },
    );
  });

  test("maps a completed GitHub run to the scheduler result", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        conclusion: "success",
        status: "completed",
        updated_at: "2026-09-04T00:18:00Z",
      }),
    );
    const client = new GitHubWorkflowClient({
      fetch,
      owner: "aidanaden",
      ref: "main",
      repository: "jupiter-i18n-translation-pilot",
      token: "test-token",
      workflow: "crowdin-export.yml",
    });

    await expect(client.getRun(42)).resolves.toEqual({
      completedAt: Date.parse("2026-09-04T00:18:00Z"),
      kind: "succeeded",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/aidanaden/jupiter-i18n-translation-pilot/actions/runs/42",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer test-token",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        method: "GET",
      },
    );
  });
});
