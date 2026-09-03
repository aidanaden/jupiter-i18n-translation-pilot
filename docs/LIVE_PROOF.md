# Live-proof runbook

Use this runbook only after a Jupiter organization admin authorizes the repository, Crowdin project, Cloudflare Worker, integrations, secrets, and named tester invitations. Do not start a trial or paid plan.

The controlling architecture is `apps/jupiter-ui/docs/I18N_TRANSLATION_PILOT_ARCHITECTURE.md` at monorepo commit `dc8a2b5dc71`. Record links and timestamps in the authorized internal evidence location, not in this public repository.

A public repository under the maintainer's personal GitHub account may be used for pre-flight CI, integration, and deployment checks. It does not satisfy the ownership and permission proof. Transfer it to TeamRaccoons, reauthorize the Crowdin and Cloudflare GitHub Apps, restore branch protection, and verify the organization-owned deployment before inviting the real cohort.

## Before the cohort

1. Tag the reviewed baseline and confirm the Worker serves that commit.
2. Confirm Crowdin and Cloudflare show Free plans with no subscription or trial countdown.
3. Confirm each translator has an individual account. One maintainer owns review and approval.
4. Confirm the Crowdin integration reads sources from `main`.
5. Confirm the native translation Sync Schedule is empty.
6. Confirm the existing Simplified Chinese baseline was imported once.
7. Confirm **Always import translations** is disabled.
8. Confirm the export workflow pins the reviewed Crowdin Action commit.
9. Confirm the dedicated scheduler Worker owns one SQLite Durable Object and no SSR application bindings.
10. Confirm the scheduler has only the repository-restricted GitHub dispatch credential. Do not copy a Crowdin credential to Cloudflare.
11. Confirm the scheduler health is `waiting` and its next alarm is minute 17 UTC.
12. Confirm the workflow disables both uploads, downloads only approved `zh-CN`, skips untranslated strings, writes `l10n`, and targets `main`.
13. Confirm `CROWDIN_BRANCH_NAME` and `CROWDIN_BRANCH_ID` match the live Crowdin version branch.
14. Confirm the Crowdin token is limited to this pilot and the scopes proven by the export canary.
15. Confirm GitHub Actions may create pull requests but has read-only default permissions.
16. Confirm `main` requires a pull request and the `verify` check with no bypass.
17. Confirm Cloudflare deploys `main` as its production branch.
18. Assign each translator a disjoint message. Assign two translators one controlled same-message collision.
19. Record the baseline PO commit, Worker URL, scheduler health, catalog timestamp, participant roles, and UTC start time.

## Cohort release

1. Have translators work concurrently. Keep protected ICU variables and rich-text placeholders unchanged.
2. Confirm Crowdin records individual attribution for disjoint edits and both collision attempts.
3. Have the maintainer choose the collision result, then review and approve the complete cohort.
4. Wait for the scheduler-dispatched Action to update `l10n` with one reviewed `zh-Hans/messages.po` change.
5. Reject source, configuration, generated-code, or unrelated file changes.
6. Merge `l10n` into `main` only after CI passes.
7. Record the review-complete, `l10n` update, merge, deployment-start, and stable-live timestamps.
8. Verify desktop and 390×844 mobile layouts for English, Simplified Chinese, and `en-XA`. Check locale hydration, inspector metadata, horizontal overflow, and browser errors.

The release passes only if a Durable Object alarm dispatches one Action run and that run updates `l10n` without a manual PO upload. The run must complete within 90 minutes of the intended alarm time. Record `slo-missed` as a scheduler failure. This target is monitored, but no provider guarantees the complete Crowdin and GitHub path within 90 minutes. After the maintainer merges the validated change, Cloudflare must update the stable Worker without a manual deployment.

## Evidence to retain

- Free-plan and account-limit state after any initial trial period
- Public project visibility, contributor visibility, and Global Translation Memory behavior
- PO round-trip diff for semantic IDs, source text, comments, ICU variables, rich-text placeholders, deletion behavior, and target-only export
- Target-PO-only repository change and CI result
- Alarm due time, stable dispatch ID, Action run, `l10n` update, merge, deployment-start, and stable-live UTC timestamps
- Scheduler health before and after the run, including the 90-minute deadline and completion time
- Concurrent edit attribution, controlled collision, maintainer resolution, and final cohort catalog
- Worker screenshots or captures for desktop and mobile, including commit and catalog timestamp
- Repository permissions, branch protection, integration scopes, and secret scopes

## Reset

1. Restore the tagged baseline through a reviewed repository change.
2. Synchronize the baseline into Crowdin without deleting cohort history or attribution.
3. Wait for the automatic Worker deployment.
4. Confirm the stable Worker again shows the baseline commit and catalog timestamp.
5. Keep the cohort PO diff, activity history, build records, timing evidence, and reset commit.

If any proof fails, stop. Reopen the affected provider or workflow decision instead of weakening SSR, Git-owned PO catalogs, review, isolation, or recovery requirements.
