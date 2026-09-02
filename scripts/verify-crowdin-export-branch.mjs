import { pathToFileURL } from "node:url";

import * as z from "zod";

const API_BASE_URL = "https://api.crowdin.com/api/v2";
const PAGE_LIMIT = 500;
const environmentSchema = z.object({
  CROWDIN_BRANCH_ID: z.coerce.number().int().positive(),
  CROWDIN_BRANCH_NAME: z.string().min(1),
  CROWDIN_PERSONAL_TOKEN: z.string().min(1),
  CROWDIN_PROJECT_ID: z.coerce.number().int().positive(),
});
const branchPageSchema = z.object({
  data: z.array(
    z.object({
      data: z.object({
        id: z.number().int().positive(),
        name: z.string().min(1),
      }),
    }),
  ),
});

export async function verifyCrowdinExportBranch({ environment, fetch }) {
  const parsedEnvironment = environmentSchema.safeParse(environment);
  if (!parsedEnvironment.success) {
    const invalidNames = [
      ...new Set(parsedEnvironment.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(`Invalid Crowdin export configuration: ${invalidNames.join(", ")}`);
  }
  const {
    CROWDIN_BRANCH_ID: branchId,
    CROWDIN_BRANCH_NAME: branchName,
    CROWDIN_PERSONAL_TOKEN: token,
    CROWDIN_PROJECT_ID: projectId,
  } = parsedEnvironment.data;
  const branches = [];

  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const response = await fetch(
      `${API_BASE_URL}/projects/${projectId}/branches?limit=${PAGE_LIMIT}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      throw new Error(`Crowdin branch lookup failed with HTTP ${response.status}`);
    }
    const page = parseBranchPage(await response.json());
    branches.push(...page);
    if (page.length < PAGE_LIMIT) break;
  }

  const matches = branches.filter((branch) => branch.id === branchId && branch.name === branchName);
  if (matches.length !== 1) {
    throw new Error(`Crowdin branch ${branchName} with ID ${branchId} was not found exactly once`);
  }
  return matches[0];
}

function parseBranchPage(input) {
  const parsed = branchPageSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Crowdin branch response is invalid");
  }
  return parsed.data.data.map((entry) => entry.data);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const branch = await verifyCrowdinExportBranch({ environment: process.env, fetch });
  process.stdout.write(`Verified Crowdin branch ${branch.name} (${branch.id})\n`);
}
