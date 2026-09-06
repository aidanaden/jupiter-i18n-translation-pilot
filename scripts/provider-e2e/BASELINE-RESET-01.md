# Exact baseline reset review

The full app review has a separate reset purpose. Only a branch named `aidan/lingo-candidate-reset-<suffix>` can select it. The suffix must meet the existing candidate branch rules. Reset needs exactly one catalog-only commit from the current isolated base. The first committed target and the final target must be identical.

The code reads the source and Chinese catalog at `ed5dc31e70930c8bdb7d3675d208dd99395647d2` through the existing bounded GitHub contents reader. Fixed SHA-256 values also check those exact bytes. The current base source must equal that source. The reset target must equal that Chinese catalog byte for byte. The existing app source adapter validates this pinned baseline. It permits the original empty `pilot.recording.proof` entry through its validated English fallback. It does not permit an arbitrary empty translation in reset mode.

Ordinary translation branches still use strict catalog validation. The original blank proof entry fails that normal translation check. Reset packets use version `full-app-review-v2`, purpose `reset-baseline`, and the explicit baseline SHA. Normal packets use purpose `translation-review` and a null reset baseline SHA. The summary labels the table as baseline restoration, not a new AI translation. Each new packet has a new digest. Historical packets cannot approve it.

The same protected environment and actual human approval are required. The local maintainer check still verifies current branch protection, trusted code, exact artifact, successful workflow, and current content. Merge and deployment still need separate approval. All packet and receipt delivery, merge, and deployment flags remain false. The same-account reviewer is a workflow-test reviewer, not proof of qualified Chinese review.

This change does not alter the app, build, workflow, catalogs, or runtime fallback. Existing isolated runtime evidence remains applicable because the app and its baseline bytes are unchanged. The reset mode handles the same original empty proof entry already supported by that runtime. These new tests prove the review boundary, not a live reset or recording.

The setup PR remains a separate bootstrap step. Its non-candidate branch skips the review jobs, and the final `lingo-delivery` gate fails. This change does not weaken that gate. Setup CI results and exact bootstrap merge approval must be handled separately before branch protection requires the candidate gate.

Local checks passed: formatting fix and check, lint fix and check, scheduler type generation, and type check. The full serial test suite passed all 343 tests in 19 files. The full review suite has 98 tests. The new cases check the exact pin, blank-proof normal rejection, source and target byte changes, extra blanks and commits, incorrect branch and merge references, unrelated files, truncated pinned contents, missing fresh approval, changed purpose and pin, and the unchanged maintainer code check. No provider job, network write, push, merge, deployment, or live reset was used.

## Candidate-checkout test correction

The first reset tests read the baseline target from the current app file. That is not stable in a target-only translation PR. The tests now read the exact original target with `git show` at the fixed baseline SHA. The app adapter tests use that same fixed source and target for their original-blank and exact-render assertions. CI already fetches full history. A missing fixed commit fails these tests; there is no fallback to the candidate. The extra-blank mutation also asserts that it changed its controlled baseline bytes.

A separate detached worktree at the test-fix commit was used for verification. All 13 Chinese target entries were replaced with a valid synthetic candidate derived from the source. Each entry has a test prefix; the proof is nonempty. This was not a provider request or human-reviewed translation. Its target SHA-256 is `bde569e8f3affcb461954894a8b46e29546f2cc2f2a48e7953075fff3d0f19df`. Only that target file differs in the detached worktree. Formatting, lint, type check, and the full serial 343-test suite passed against this candidate checkout. The original worktree catalogs remain unchanged.

The normal CI test command, `pnpm run test`, also passed all 343 tests in the candidate checkout without a worker-count override. The detached checkout remains local for inspection at `/Users/aidan/Developer/jupiter-i18n-lingo-candidate-suite`; its candidate PO is test data only and is not part of the commit.

## Real CLI test time limit

The integration run at `1778226` passed 342 tests but timed out in the first app catalog CLI test: 6100 ms against the default 5000 ms limit. This test starts three separate Node processes that load Lingui, then checks real private files. The second test starts two processes to check rejected arguments. These tests do not check a five-second product requirement. Each test now has an explicit 30-second limit, and each `execFileSync` child has a 10-second timeout. Assertions are unchanged. No global test timeout or app behavior changed.

The child timeout uses `SIGKILL` so a stalled child cannot ignore the termination signal. Formatting, lint, and type checks passed. The normal `pnpm run test` command passed all 343 tests with the final timeout settings. Candidate test data and functional assertions did not change, so the earlier full candidate-checkout pass remains applicable.
