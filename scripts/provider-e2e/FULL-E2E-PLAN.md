# Full Lingo recording: delivery preparation

Status: local implementation in progress. This is not a recording completion receipt.

## Required result

Record one fresh cycle from the English pilot UI through Lingo generation, human correction and approval, a protected catalog PR, isolated deployment, a second sync, and reset. Keep one visible message through every step. Preserve raw footage and label removed waits. Do not insert old successful runs into the new cycle.

The old 14-message Lingo fixture and the actual 13-message UI catalog share no message IDs. The old receipt verifies a saved artifact only. Its `deliveryAllowed: false` contract stays unchanged. Neither the old draft nor its approval can authorize the new UI catalog.

## Fixed targets

| Item                        | Target                                        |
| --------------------------- | --------------------------------------------- |
| Repository                  | `aidanaden/jupiter-i18n-translation-pilot`    |
| Implementation fixed point  | `ed5dc31e70930c8bdb7d3675d208dd99395647d2`    |
| Local implementation branch | `aidan/lingo-app-delivery`                    |
| Existing test base          | `aidan/provider-e2e-lingo-base`               |
| English source              | `src/i18n/locales/en/messages.po`             |
| Translated file             | `src/i18n/locales/zh-Hans/messages.po`        |
| Generated file              | `src/i18n/locales/zh-Hans/messages.ts`        |
| Visible message             | `baseline.swap.review`, English `Review swap` |
| Proposed separate Worker    | `jupiter-i18n-lingo-e2e`                      |
| Private Cloudflare account  | `267eec222a3650d37a3129a967a3f298`            |

No new Worker has been created. Do not use the default deploy command: it names the existing pilot Worker. Do not change `main`, `l10n`, PR 19, the hourly export workflow, either scheduler, or the existing pilot site.

## Verified gaps

Read-only GitHub checks returned no classic branch protection and no applicable rules for the test base. The user approved disabling the existing pilot's non-production builds. The change is saved and a dashboard reload confirms it. Production branch `main` and its build/deploy commands are unchanged. Test pushes can now proceed without automatic version uploads to the existing pilot.

The default Wrangler login is the Lab account. The retained migration login is private-account-only and still works. Use that isolated login for later read-only checks and any separately approved deployment. Do not replace the default login.

Private-account read-back on 7 September confirms that `jupiter-i18n-lingo-e2e` does not exist (Cloudflare 10007). After the build setting change, the existing pilot's latest deployment is still `7a3e324a-3401-4d51-a00a-5ae5c3bf3b4d`, created on 5 September. Neither scheduler was changed. The recorder container is running, with 88 GB free.

## Ordered implementation

1. Convert the real app catalog through a separate, exact-source-bound adapter. Keep IDs, context, ICU arguments and rich tags. Preserve the baseline and original AI output as separate files. A prepared draft is not approved for delivery.
2. Prepare a full-run review packet. Bind source, candidate, raw result, engine, glossary, commit, attempt and destination. Show the actual English text and original/corrected candidate. A correction creates a new packet and needs a new review.
3. Add a separate delivery verifier. Read current GitHub run, artifact, approval and reviewer policy. Reject old runs, changed source, changed target, changed head, wrong reviewer, missing approval and unprotected destinations. Never treat a local receipt or an agent-generated flag as human approval.
4. Stage only the reviewed Chinese catalog. Compile it with the app build, then check the expected wording in the actual rendered UI. Create a target-only PR from a dedicated branch to the fixed test base. Require the exact-head delivery check and no administrator bypass before merge.
5. Inspect the final build configuration and private account. Obtain the exact merge and deployment approval. Publish only to the separate test Worker, then verify its URL, commit, catalog hash, server output and browser output. Keep draft text off the accepted test page.
6. Implement durable correction retention. A second sync with unchanged source must not replace accepted human wording. A changed source creates a pending candidate, not a silent release. Reset only the cycle-owned catalog change through a protected PR and verify the baseline.
7. Complete live safety checks before the final recording. Then start capture before source import. Use immediate triggers, not scheduler changes. Record each real action through reset. Retain failed attempts separately.

## Checks and boundaries

The public adapter and immutable staging directory are the first test boundaries. Use real Lingui parsing, compilation and rendering for the catalog checks, and the real filesystem for staging. Mock only external service boundaries. Local tests do not count as live GitHub protection or deployed UI evidence.

The user approved one Lingo generation using the actual 13-message catalog, within the aggregate USD 5 monthly provider-test limit. Do not start it until capture and the complete delivery path are ready. Recorder hosting is separate. No automatic paid retry or top-up is approved. Final merge, deployment and new credential grants remain separate approval gates. Human review is performed by the user's existing test account; this does not prove independent roles or qualified Chinese review.

Remaining exact decisions: final exact merge and deployment approval after checks. The non-production build setting change is complete. Do not ask for that approval again. Provider context/glossary support must be verified before any translation-quality comparison. The JSON route previously omitted context during generation; restoring comments afterward does not remove that limit.
