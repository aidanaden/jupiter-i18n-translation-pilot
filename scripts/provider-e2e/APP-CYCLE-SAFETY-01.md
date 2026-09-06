# App cycle safety

These helpers prepare local data only. They do not prove human approval, Git ancestry, branch protection, a provider response, or a deployed version. They cannot authorize a merge or deployment.

## Contract

`createAppCycleSnapshot` keeps the exact English source, original Chinese baseline, and accepted Chinese catalog. It binds those bytes to the test repository, isolated base branch, run ID, attempt 1, source SHA, base SHA, and accepted SHA. It checks the 13-message catalog through the existing app adapter and catalog validator. The snapshot and its hashes are frozen. Its digest is an integrity check, not a signature.

The caller must get the expected digest and references from the saved run record, not from an untrusted candidate. The caller must independently check each supplied Git SHA and its relationship to the run. The caller must check the current Git head and file bytes against the real test branch. `current.changedPaths` must be the complete diff from `baseSha` to that current head. The only permitted path is `src/i18n/locales/zh-Hans/messages.po`.

`planAppCycleSync` rejects current source, head, target, or run-reference drift. On unchanged source it returns `no-op` and makes no provider request. It does not write the accepted catalog. Thus it preserves the exact correction. An explicit `nextSourcePo` is a proposed future source, not the current source. A valid changed proposal returns `review-required`, with no replacement target and no provider request. It needs a new generation and review cycle outside this helper.

`planAppCycleReset` requires the same exact current state. It returns only the saved baseline Chinese PO and its catalog path for a protected reset PR. It does not reset Git, create a PR, merge, or deploy. A changed head, unrelated change, or missing run-owned target stops reset preparation. The caller must verify the live deployment and human approval separately before any live reset step.

## CLI

Run `node scripts/provider-e2e/app-cycle-cli.mjs snapshot INPUT_JSON`, or use `sync` or `reset` with a planner input JSON file. The snapshot input holds the fields described above. Planner inputs contain `snapshot`, independently obtained `expected` references and digest, and `current` head, source PO, target PO, and changed paths. Only sync accepts `nextSourcePo`.

Each command creates a new temporary directory outside this repository with mode 0700. Artifact files use mode 0600 and exclusive creation. Reset also writes `baseline-target.po` in that directory. There is no output-path argument and no app, Git, provider, or Worker write. The command prints only the artifact directory and its status, with merge and deployment permission set to false.

## Local verification

The 23 focused tests cover exact bytes and frozen hashes, repeat sync with no network call, proposed source changes, exact baseline restoration, wrong repository and branch, wrong run and attempt, digest and Git-reference drift, source and target drift, unrelated paths, invalid placeholders, false approval metadata, and real temporary artifact file permissions. These are local implementation tests. They are not live recording or language-review evidence.

`pnpm run format:fix`, `pnpm run lint:fix`, `pnpm run format:check`, and `pnpm run lint:check` passed. The first type check failed because this new worktree did not have the generated scheduler types. After `pnpm run scheduler:cf-typegen`, `pnpm run typecheck` passed. `pnpm exec vitest run --config vitest.config.ts scripts/provider-e2e/app-cycle.test.mjs --maxWorkers=1` passed all 23 tests. No remote command, provider job, push, merge, deployment, or live reset was used.

The offline runner's correction-preservation rule informed this boundary. Its simulated actors and approval state are not used here. Existing `createAppSourcePacket`, `poToLingoJson`, and `validateCatalogs` supply the catalog checks; there is no new dependency.
