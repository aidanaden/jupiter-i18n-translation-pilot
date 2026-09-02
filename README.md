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

Crowdin's native GitHub integration reads the English PO from `main`. Its translation schedule stays disabled. The pinned official Crowdin GitHub Action downloads approved Simplified Chinese translations at minute 17 of each hour, writes the machine-owned `l10n` branch, and opens a pull request to `main`. The maintainer merges the validated pull request, and Cloudflare deploys `main`.

The workflow requires a pilot-only Crowdin token and an explicit `CROWDIN_BRANCH_NAME` repository variable. It stops before export when that variable is missing. [The live-proof runbook](docs/LIVE_PROOF.md) contains the integration settings and exceptional reset procedure.

## External proof gate

Do not create or change Crowdin, Cloudflare, GitHub integration, secret, deployment, or tester resources without explicit organization authorization. The live proof must follow `apps/jupiter-ui/docs/I18N_TRANSLATION_PILOT_ARCHITECTURE.md` from monorepo commit `89cb045147a`.
