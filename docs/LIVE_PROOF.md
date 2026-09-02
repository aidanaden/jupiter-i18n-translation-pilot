# Live-proof runbook

Use this runbook only after a Jupiter organization admin authorizes the repository, Crowdin project, Cloudflare Worker, integrations, secrets, and named tester invitations. Do not start a trial or paid plan.

The controlling architecture is `apps/jupiter-ui/docs/I18N_TRANSLATION_PILOT_ARCHITECTURE.md` at monorepo commit `89cb045147a`. Record links and timestamps in the authorized internal evidence location, not in this public repository.

A public repository under the maintainer's personal GitHub account may be used for pre-flight CI, integration, and deployment checks. It does not satisfy the ownership and permission proof. Transfer it to TeamRaccoons, reauthorize the Crowdin and Cloudflare GitHub Apps, restore branch protection, and verify the organization-owned deployment before inviting the real cohort.

## Before the cohort

1. Tag the reviewed baseline and confirm the Worker serves that commit.
2. Confirm Crowdin and Cloudflare show Free plans with no subscription or trial countdown.
3. Confirm each translator has an individual account. One maintainer owns review and approval.
4. Confirm the Crowdin integration reads sources from `main`.
5. Confirm the native translation Sync Schedule is empty.
6. Confirm the existing Simplified Chinese baseline was imported once.
7. Confirm **Always import translations** is disabled.
8. Confirm the scheduled export workflow pins the reviewed Crowdin Action commit.
9. Confirm the workflow disables both uploads, downloads only approved `zh-CN`, skips untranslated strings, writes `l10n`, and targets `main`.
10. Confirm `CROWDIN_BRANCH_NAME` matches the live Crowdin version branch.
11. Confirm the Crowdin token is limited to this pilot and the scopes proven by the export canary.
12. Confirm GitHub Actions may create pull requests but has read-only default permissions.
13. Confirm `main` requires a pull request and the `verify` check with no bypass.
14. Confirm Cloudflare deploys `main` as its production branch.
15. Assign each translator a disjoint message. Assign two translators one controlled same-message collision.
16. Record the baseline PO commit, Worker URL, catalog timestamp, participant roles, and UTC start time.

## Cohort release

1. Have translators work concurrently. Keep protected ICU variables and rich-text placeholders unchanged.
2. Confirm Crowdin records individual attribution for disjoint edits and both collision attempts.
3. Have the maintainer choose the collision result, then review and approve the complete cohort.
4. Wait for the scheduled Action to update `l10n` with one reviewed `zh-Hans/messages.po` change.
5. Reject source, configuration, generated-code, or unrelated file changes.
6. Merge `l10n` into `main` only after CI passes.
7. Record the review-complete, `l10n` update, merge, deployment-start, and stable-live timestamps.
8. Verify desktop and 390×844 mobile layouts for English, Simplified Chinese, and `en-XA`. Check locale hydration, inspector metadata, horizontal overflow, and browser errors.

The release passes only if one scheduled Action run updates `l10n` without a manual PO upload. GitHub does not guarantee that every scheduled job runs on time, so record any delay or dropped run as a scheduler failure. After the maintainer merges the validated change, Cloudflare must update the stable Worker without a manual deployment.

## Evidence to retain

- Free-plan and account-limit state after any initial trial period
- Public project visibility, contributor visibility, and Global Translation Memory behavior
- PO round-trip diff for semantic IDs, source text, comments, ICU variables, rich-text placeholders, deletion behavior, and target-only export
- Target-PO-only repository change and CI result
- Review-complete, `l10n` update, merge, deployment-start, and stable-live UTC timestamps
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
