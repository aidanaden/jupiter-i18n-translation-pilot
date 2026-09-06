# Full Lingo recording runbook

Status: preparation only. No fresh full recording exists.

## Start conditions

- The setup code is on the isolated test base after a separately approved merge.
- The existing pilot cannot build test pushes. Its production build and both schedulers are unchanged.
- The isolated base has the required exact-head check, with no administrator bypass.
- A live run proves that the workflow can read its required GitHub data. Local tests alone do not meet this condition.
- The local maintainer verifier checks branch protection and the trusted workflow before any merge request.
- The isolated build passes with changed Chinese wording. Old Crowdin fixture checks do not determine the expected Lingo wording.
- The correction-retention and cycle-owned reset paths are verified. The old Crowdin reset command must not reset this cycle.
- The private Worker target, reviewed commit, catalog hash, and final merge/deployment approval are recorded.
- Recorder display, audio choice, output directory, and authenticated provider pages are ready. Keep passwords and token pages off the recording display.

Do not spend the approved generation while a start condition is open. Do not use a new paid retry without approval.

## Recording order

Keep `baseline.swap.review` visible at each relevant step. The English text is `Review swap`. Show the other 12 messages in the review table. Do not describe the workflow test as qualified Chinese review.

The current UI footer shows a short commit ID and a catalog timestamp. It does not show a catalog hash. Verify the hash in the build and review evidence, and show that evidence beside the page when needed. Do not label the timestamp as a content hash.

| Step | Show the action                                                                                                    | Keep as evidence                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open the actual English pilot UI. Explain the source, reviewer, and maintainer roles.                              | Starting commit, source hash, and baseline target hash.                                                                                              |
| 2    | Export the 13-message source packet. Open the provider input and start the approved generation.                    | Exact input, raw output, engine/settings visible in the provider, and cost or quota change.                                                          |
| 3    | Stage the result as unreviewed and create the catalog-only candidate PR.                                           | Raw output and first draft kept separately; exact PR base and head.                                                                                  |
| 4    | Show the pending review and blocked delivery.                                                                      | Real check state; no draft appears on the accepted test site.                                                                                        |
| 5    | Show the reviewer comparing English, context, draft, and candidate. Record a correction as a new commit.           | Before/after text and the new run. The old approval must not apply.                                                                                  |
| 6    | Show the human test reviewer approving the corrected packet.                                                       | GitHub approval for the exact run and packet. The agent must not submit this approval.                                                               |
| 7    | Run the maintainer verifier. After separate approval, merge and deploy only to the isolated Worker.                | Current policies, trusted workflow, exact content, merge commit, build config, and deployed version.                                                 |
| 8    | Open the translated UI and switch between English and Chinese.                                                     | Corrected visible text, locale, commit, catalog hash, and HTTP results.                                                                              |
| 9    | Run the correction-retention check with unchanged source.                                                          | Accepted wording stays unchanged. State clearly which protection is custom code and which is provided by Lingo. No extra paid generation is implied. |
| 10   | Prepare the cycle-owned reset PR. After its review and separate merge/deployment approval, verify the baseline UI. | Only this cycle's catalog change is reversed; unrelated content is unchanged.                                                                        |

Steps 9 and 10 have local data-integrity helpers, but still need live verification. The caller must read the real Git and deployed state before it uses those helpers. A local simulation is not a substitute.

The reset review mode permits only the exact source and target bytes pinned at `ed5dc31e70930c8bdb7d3675d208dd99395647d2`, through one catalog-only commit and a fresh protected review. Use a branch named `aidan/lingo-candidate-reset-<suffix>`. The original baseline contains an empty `pilot.recording.proof` entry; this exact reset restores its English fallback. The normal full-translation check still rejects that empty entry. The reset path needs live verification before paid generation. See `BASELINE-RESET-01.md` for the local checks.

## Editing rules

Use one fresh cycle for the main video. Keep raw segments in order, with timestamps. Use short titles that name the actor, action, and expected result. Label removed waits. Keep the same visible message through transitions.

Keep failed attempts and older clips separate. Do not insert the saved PR 20 review into the new cycle. Do not hide a missing step with a title card. Check the exported video from start to end, including readable text, transitions, and the final reset.

## Provider comparison boundary

The video must distinguish provider features from test code. This matters when comparing setup and maintenance costs for a small team.

| Part                                 | Owner in this test                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| AI translation generation            | Lingo, using the recorded engine and plan.                                                                                |
| PO-to-JSON and JSON-to-PO conversion | Custom adapter using Lingui.                                                                                              |
| Context and preferred terms          | PO comments are shown to the reviewer, but are not sent by this JSON generation path. No provider glossary is configured. |
| Human approval                       | GitHub protected environment plus custom exact-content checks.                                                            |
| Merge checks and isolated deployment | GitHub, local verification code, and Cloudflare.                                                                          |
| Correction retention and reset       | Custom test code and the maintainer procedure; not evidence of a native Lingo feature.                                    |

Do not describe the full workflow as an out-of-the-box Lingo feature. Keep this setup cost in the provider comparison. A workflow test does not establish translation quality.

## Current health check

On 7 September 2026, the recorder at `100.83.54.116` was reachable through SSH. Both recorder containers were running. Display `:100`, `ffmpeg`, and `ffprobe` were present. The host had 88 GB free. This check did not start capture or prove that the current provider session is authenticated.
