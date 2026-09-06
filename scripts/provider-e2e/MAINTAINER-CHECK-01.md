# Local maintainer check

The GitHub workflow does not read branch protection. That API needs Administration read access, which the normal workflow token does not provide. The workflow packet and receipt state that branch protection is not checked. Both still forbid delivery, merge, and deployment.

Use the existing local `gh` login. The CLI does not accept a token. It removes token environment overrides for each `gh` call. All GitHub operations use GET and the fixed pilot repository. It does not run remote code.

Before the candidate run:

```sh
node scripts/provider-e2e/maintainer-check-cli.mjs preflight --trusted-base FULL_REVIEWED_BASE_SHA
```

After the human approves the exact packet and all three workflow jobs pass:

```sh
node scripts/provider-e2e/maintainer-check-cli.mjs verify --trusted-base FULL_REVIEWED_BASE_SHA --run RUN_ID --artifact PACKET_ARTIFACT_ID --packet-digest REVIEWED_PACKET_SHA256
```

The base must be a full local commit SHA that the maintainer has reviewed. A branch name is not accepted. The CLI compares the full remote base tree with this local tree. It compares the full candidate and merge trees with the same tree, with only the Chinese PO file excepted. This pins workflow YAML, scripts, package scripts, lockfile, and other files. Git modes and blob IDs must also match. Symlinks, submodules, duplicate paths, unknown entries, and truncated trees fail closed.

The final check downloads the exact packet artifact through `gh`, checks its SHA-256 against GitHub metadata, and reads only `packet.json` from the ZIP without filesystem extraction. Only `packet.json` and `REVIEW.md` are accepted. Private temporary ZIP files are removed after parsing. JSON, archives, process output, API pages, and process time are bounded.

The final check verifies the live PR, exact base/head/merge refs, linear target-only commit history, catalog packet digest, immutable artifact identity, environment ID, branch policy ID, reviewer ID, and approval record. It also verifies the strict isolated branch protection and the actual completed successful `prepare`, `reviewed`, and `lingo-delivery` jobs for attempt 1. A green check name alone is insufficient. It reads branch protection and the review evidence again before returning.

The result is only `ready-for-user-approval`. It grants no merge or deployment authority. Run the check again immediately before an explicitly approved action. A receipt is a time-bound observation, not a lock against later GitHub changes.

## Verification

Tests cover missing and changed branch protection, altered base executable code, altered head/merge YAML, truncated trees, wrong merge parents, skipped or forged job results, wrong head/run/artifact/digest, changed live head, invalid CLI options, API errors and pagination, and real ZIP parsing and cleanup. The old 14-message modules are unchanged.

At this change, the serial suite passed 288 tests with `--testTimeout=20000`. An earlier run passed 287 tests before the final stale-head test was added. The next run passed 287 of 288 tests; the existing app-catalog CLI test exceeded its 5-second limit under system load. The test timeout was extended only in the repeat command, not in repository settings. Formatting and lint passed. Typecheck first failed because this new worktree had no generated scheduler types. After local `scheduler:cf-typegen`, typecheck passed. No live write was performed.

## Live limits

The new full workflow and final maintainer check have not passed against a live candidate. The isolated base still needs the reviewed setup code and required branch protection. The local login must be able to read branch protection; an access failure stops the check. Existing Actions metadata confirms job `head_sha` and `run_attempt` fields, but that is not a live pass for this workflow.

This is a same-account workflow test, not qualified Chinese review or independent roles. The first committed draft does not prove Lingo origin. PO context and glossary data are not sent through the current JSON generation adapter. Action version tags and package registry integrity remain external trust dependencies. An administrator can change repository policy after a read; a fresh check and explicit user approval remain required. No merge, deployment, provider payment, or fresh full recording was made by this change.
