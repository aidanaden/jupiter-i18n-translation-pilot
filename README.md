# Jupiter i18n translation pilot

This throwaway repository tests a public Crowdin Free translation workspace against a Cloudflare Workers Free SSR sandbox. Its source is prototype commit `16d5040f3d6f8a4553b53aa8bd68f28eb61f7fcb` from `TeamRaccoons/monorepo`.

The application contains fixed data only. It does not connect a wallet, request quotes, submit transactions, call production APIs, or contain production secrets.

## Local verification

```bash
pnpm install
pnpm run format:check
pnpm run lint:check
pnpm run typecheck
pnpm run test
pnpm run i18n:sync
pnpm run verify:ssr
```

`verify:ssr` builds the Worker, starts the production preview, and confirms that English, Simplified Chinese, and the pseudo-locale produce distinct server-rendered HTML. The pilot does not prerender `/`; query-string locale selection must run on every request to match Jupiter UI's SSR behavior.

The stable application displays its deployed commit and catalog timestamp in the translation dock. See [docs/LIVE_PROOF.md](docs/LIVE_PROOF.md) for the authorized cohort procedure and evidence checklist.

## Scheduled Crowdin export

Crowdin's native GitHub integration reads the English PO from `main`. Its translation schedule stays disabled. A dedicated Cloudflare scheduler Worker uses one SQLite Durable Object alarm to dispatch the GitHub export workflow at minute 17 of each hour. The alarm stores a stable dispatch ID, adopts an existing GitHub run after an uncertain response, retries failures, and records a missed 90-minute service-level objective in its health response.

The scheduler has its own Worker configuration under `scheduler/`. It receives one repository-restricted GitHub dispatch credential. It does not receive Crowdin credentials and does not share bindings with the public SSR Worker. A 15-minute Cloudflare Cron Trigger only restores a missing alarm. The Durable Object alarm owns the hourly clock.

The pinned official Crowdin GitHub Action downloads approved Simplified Chinese translations, writes the machine-owned `l10n` branch, and opens a pull request to `main`. The maintainer merges the validated pull request, and Cloudflare deploys `main`.

The workflow requires a pilot-only Crowdin token and explicit `CROWDIN_BRANCH_NAME` and `CROWDIN_BRANCH_ID` repository variables. It verifies both values against the live Crowdin API before export. The separate human-cohort procedure remains in [the live-proof runbook](docs/LIVE_PROOF.md).

Use these commands to verify the scheduler before deployment:

```bash
pnpm run scheduler:cf-typegen
pnpm run scheduler:deploy:dry-run
```

Before deployment, run `pnpm exec wrangler whoami`. Stop unless the signed-in identity and selected account match the authorized private Cloudflare account. Keep the private email and account ID out of the repository. After deployment, store the repository-restricted token as `GITHUB_DISPATCH_TOKEN`.

The `/health` endpoint reports `unarmed`, `waiting`, `dispatch-pending`, `tracking`, or `slo-missed` without returning credentials. It retains the latest missed SLO after the scheduler advances. A non-null `lastMiss` blocks the recording and reopens the scheduler decision.

For pre-flight testing, `POST /canary` starts the same dispatch and tracking path immediately without changing the pending hourly due time. The route is disabled unless both `GITHUB_DISPATCH_TOKEN` and `CANARY_TRIGGER_TOKEN` exist, requires `Authorization: Bearer <CANARY_TRIGGER_TOKEN>`, and refuses to overlap an active run. Provision the canary token only for the test window. Require two successful fast canaries minutes apart, then one successful minute-17 hourly run. Delete the canary token before the live proof so the scheduler returns to its single GitHub credential.

## External proof gate

Do not create or change Crowdin, Cloudflare, GitHub integration, secret, deployment, or tester resources without explicit authorization. The personal scheduler is for pre-flight and recording only. It does not satisfy the organization-ownership proof. The live proof must follow `apps/jupiter-ui/docs/I18N_TRANSLATION_PILOT_ARCHITECTURE.md`.
