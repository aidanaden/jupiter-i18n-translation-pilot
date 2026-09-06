# Full recording: local progress

Date: 7 September 2026. Integration branch: `aidan/lingo-app-delivery`.

## Result

The app catalog adapter, exact-content review workflow, isolated build, local maintainer verifier, fresh-catalog SSR checks, and local cycle safety helpers are combined. This is not a full recording or live delivery receipt.

The source catalog and all application files are unchanged from `ed5dc31e70930c8bdb7d3675d208dd99395647d2`. The first continuation made no push, paid generation, merge, deployment, or Cloudflare setting change. The later continuation below records the approved build-setting change and the completed reset checks.

## Evidence

- At integrated commit `d97ce30871bbc5fa75bf6f1f1a9ebdf4f895032c`, all 325 tests passed in 19 files with `pnpm exec vitest run --config vitest.config.ts --maxWorkers=1 --testTimeout=20000`.
- After the mechanical import change, all 325 tests passed again with one worker and the default timeout. Format fix, lint fix, format check, lint check, typecheck, and `git diff --check` passed.
- Earlier gate integration passed all 263 tests with the default timeout and one worker. An earlier two-worker attempt had 262 passes and one CLI timeout. That attempt is not recorded as a pass.
- The SSR owner verified the normal source state, the isolated baseline, and fresh synthetic Chinese review/proof text. An old build was rejected. Both SSR modes and the isolated dry run passed. No real Lingo output was used for these local checks.
- The maintainer verifier's real ZIP reader parsed historical artifact `9996183855` and produced the same SHA-256 as GitHub metadata: `08b8ee80d011cb9eb1bd22d29ff868d550daa4389567610f6d42f4b1a61dc53b`. This proves archive compatibility only. It does not approve new content or complete the new workflow.
- The new read-only maintainer preflight stopped at the current isolated base. A direct GitHub read returned `Branch not protected`. Live readiness is not passed.
- Recorder SSH, both containers, display `:100`, `ffmpeg`, and `ffprobe` were available. The host had 88 GB free. Capture was not started.

The root review found an empty-directory cleanup error in the archive reader. The owner changed the cleanup to `rmdir` and verified real ZIP parsing and cleanup. The root also moved test imports to the top of their file; this was a mechanical change.

## Access and trust

GitHub's [Get branch protection API](https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection) requires Administration read access. That check now runs locally through the existing `gh` login. The workflow still checks the exact packet, current PR, catalog-only history, review environment, artifact, and human approval. Its receipt explicitly states that a local maintainer check is required.

The local verifier compares the remote base, candidate, and merge trees with the reviewed local base. Only the Chinese PO may differ. It checks the actual successful jobs and the downloaded artifact digest. All receipts still forbid merge and deployment without separate user approval.

## Work remaining after the first continuation

1. Obtain permission to disable only non-production builds for the existing pilot Worker. Test pushes currently upload versions there. Keep `main` production builds and both schedulers unchanged.
2. Add and test the exact-baseline reset review mode described in the runbook. The current normal translation gate rejects the baseline's empty proof entry. Do not bypass that gate.
3. Use the approved PR workflow to prepare the setup PR. The bootstrap merge and isolated deployment need their exact final approval. Install test-base protection after the setup workflow is available.
4. Verify the real workflow and reset path, then start capture before the single approved generation. Record the complete new cycle, including human review, isolated delivery, correction retention, and reset.

The frontend test-selection skill kept tests at the catalog and workflow boundaries. Existing Lingui validators were reused. The offline runner's simulated actor and release state were not reused as human or live approval evidence. Pstack PR creation remains on hold because a push would cause an unapproved write to the existing Worker.

## Later continuation

The owner approved the build-setting change. `CF-BUILD-BOUNDARY-01.md` records the saved setting and unchanged live pilot version. The push restriction described above is resolved.

The exact-baseline reset review is implemented in `889c1ce`. Its normal translation path remains strict. The test-fixture correction in `1778226` makes original-baseline tests independent of the candidate's current Chinese catalog. `BASELINE-RESET-01.md` records 343 passing tests against a separate full synthetic candidate checkout, including the normal parallel test command. These local results do not replace a live reset or human review.

The root's combined normal test command at `1778226` had 342 passes and one real-CLI startup timeout at 6.1 seconds against its 5-second test limit. No assertion failed. This attempt remains a failure.

Commit `e7e878f` gives only the two real CLI tests a 30-second limit. Each child process has a 10-second timeout and a forced termination signal. No assertions, application code, or global test timeout changed. The root's normal `pnpm run test` then passed all 343 tests in 19 files. Format fix, lint fix, format check, lint check, and typecheck passed. These results cover the integrated baseline checkout. The separate synthetic candidate check remains valid because its catalog and assertions did not change.
