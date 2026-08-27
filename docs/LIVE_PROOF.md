# Live-proof runbook

Use this runbook only after a Jupiter organization admin authorizes the repository, Crowdin project, Cloudflare Worker, integrations, secrets, and named tester invitations. Do not start a trial or paid plan.

The controlling architecture is `apps/jupiter-ui/docs/I18N_TRANSLATION_PILOT_ARCHITECTURE.md` at monorepo commit `87ea4095342`. Record links and timestamps in the authorized internal evidence location, not in this public repository.

A public repository under the maintainer's personal GitHub account may be used for pre-flight CI, integration, and deployment checks. It does not satisfy the ownership and permission proof. Transfer it to TeamRaccoons, reauthorize the Crowdin and Cloudflare GitHub Apps, restore branch protection, and verify the organization-owned deployment before inviting the real cohort.

## Before the cohort

1. Tag the reviewed baseline and confirm the Worker serves that commit.
2. Confirm Crowdin and Cloudflare show Free plans with no subscription or trial countdown.
3. Confirm each translator has an individual account. One maintainer owns review and approval.
4. Assign each translator a disjoint message. Assign two translators one controlled same-message collision.
5. Record the baseline PO commit, Worker URL, catalog timestamp, participant roles, and UTC start time.

## Cohort release

1. Have translators work concurrently. Keep protected ICU variables and rich-text placeholders unchanged.
2. Confirm Crowdin records individual attribution for disjoint edits and both collision attempts.
3. Have the maintainer choose the collision result and review the complete cohort.
4. Export one reviewed `zh-Hans/messages.po` change. Reject source, configuration, generated-code, or unrelated file changes.
5. Require CI to pass before merge.
6. Start the review-to-live timer when the maintainer completes cohort review. Stop it when the stable Worker shows the merged commit and catalog timestamp.
7. Verify desktop and 390×844 mobile layouts for English, Simplified Chinese, and `en-XA`. Check locale hydration, inspector metadata, horizontal overflow, and browser errors.

The release passes only if the reviewed cohort reaches the stable Worker within 15 minutes without a paid feature or a manual deployment.

## Evidence to retain

- Free-plan and account-limit state after any initial trial period
- Public project visibility, contributor visibility, and Global Translation Memory behavior
- PO round-trip diff for semantic IDs, source text, comments, ICU variables, rich-text placeholders, deletion behavior, and target-only export
- Target-PO-only repository change and CI result
- Review-complete, merge, deployment-start, and stable-live UTC timestamps
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
