import * as z from "zod/v4-mini";

const dispatchResponseSchema = z.object({
  html_url: z.url({ protocol: /^https$/ }),
  workflow_run_id: z.int().check(z.positive()),
});
const workflowRunsResponseSchema = z.object({
  workflow_runs: z.array(
    z.object({
      display_title: z.string(),
      html_url: z.url({ protocol: /^https$/ }),
      id: z.int().check(z.positive()),
    }),
  ),
});
const workflowRunResponseSchema = z.object({
  conclusion: z.nullable(z.string()),
  status: z.string(),
  updated_at: z.iso.datetime({ offset: true }),
});

type GitHubWorkflowClientOptions = {
  fetch: typeof globalThis.fetch;
  owner: string;
  ref: string;
  repository: string;
  token: string;
  workflow: string;
};

type DispatchInput = {
  dispatchId: string;
  scheduledFor: string;
};

type GitHubRunReference = {
  id: number;
  url: string;
};

export class GitHubWorkflowClient {
  readonly #fetch: typeof globalThis.fetch;
  readonly #owner: string;
  readonly #ref: string;
  readonly #repository: string;
  readonly #token: string;
  readonly #workflow: string;

  constructor(options: GitHubWorkflowClientOptions) {
    this.#fetch = options.fetch;
    this.#owner = options.owner;
    this.#ref = options.ref;
    this.#repository = options.repository;
    this.#token = options.token;
    this.#workflow = options.workflow;
  }

  async dispatch(input: DispatchInput): Promise<GitHubRunReference> {
    const response = await this.#fetch(this.#workflowUrl("dispatches"), {
      body: JSON.stringify({
        inputs: {
          dispatch_id: input.dispatchId,
          scheduled_for: input.scheduledFor,
        },
        ref: this.#ref,
        return_run_details: true,
      }),
      headers: this.#headers({ "Content-Type": "application/json" }),
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch {
      throw new Error("GitHub workflow dispatch response is invalid");
    }

    const result = dispatchResponseSchema.safeParse(body);
    if (!result.success) {
      throw new Error("GitHub workflow dispatch response is invalid");
    }

    return { id: result.data.workflow_run_id, url: result.data.html_url };
  }

  async findRun(dispatchId: string): Promise<GitHubRunReference | null> {
    const search = new URLSearchParams({
      branch: this.#ref,
      event: "workflow_dispatch",
      per_page: "30",
    });
    const response = await this.#fetch(`${this.#workflowUrl("runs")}?${search}`, {
      headers: this.#headers(),
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`GitHub workflow run lookup failed with HTTP ${response.status}`);
    }

    const result = workflowRunsResponseSchema.safeParse(await response.json());
    if (!result.success) {
      throw new Error("GitHub workflow run list response is invalid");
    }

    const title = `Crowdin export [${dispatchId}]`;
    const run = result.data.workflow_runs.find((candidate) => candidate.display_title === title);
    return run ? { id: run.id, url: run.html_url } : null;
  }

  async getRun(
    runId: number,
  ): Promise<
    | { kind: "failed"; conclusion: string; completedAt: number }
    | { kind: "pending" }
    | { kind: "succeeded"; completedAt: number }
  > {
    const response = await this.#fetch(
      `https://api.github.com/repos/${this.#owner}/${this.#repository}/actions/runs/${runId}`,
      { headers: this.#headers(), method: "GET" },
    );
    if (!response.ok) {
      throw new Error(`GitHub workflow run lookup failed with HTTP ${response.status}`);
    }

    const result = workflowRunResponseSchema.safeParse(await response.json());
    if (!result.success) {
      throw new Error("GitHub workflow run response is invalid");
    }

    if (result.data.status !== "completed") {
      return { kind: "pending" };
    }

    const completedAt = Date.parse(result.data.updated_at);
    if (result.data.conclusion === "success") {
      return { completedAt, kind: "succeeded" };
    }

    return {
      completedAt,
      conclusion: result.data.conclusion ?? "unknown",
      kind: "failed",
    };
  }

  #headers(additional: Record<string, string> = {}) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.#token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...additional,
    };
  }

  #workflowUrl(suffix: string): string {
    return `https://api.github.com/repos/${this.#owner}/${this.#repository}/actions/workflows/${this.#workflow}/${suffix}`;
  }
}
