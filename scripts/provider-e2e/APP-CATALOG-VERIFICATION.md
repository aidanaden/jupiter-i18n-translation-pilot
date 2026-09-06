# App catalog bridge verification

Date: 7 September 2026. Fixed point: `ed5dc31e70930c8bdb7d3675d208dd99395647d2`.

## Result

The actual 13-message pilot UI catalog can now be exported as English JSON and rebuilt as a separate, unreviewed Chinese PO. Source, baseline and Git head are bound in the packet. Raw provider bytes and candidate bytes have separate hashes. Both operations return `deliveryAllowed: false`.

The saved 14-message fixture remains the conversion default. Its data, review workflow and integrity-only receipt are unchanged. The app source and target catalogs are unchanged in the implementation checkout.

## Checks

- Full Vitest suite: 204 tests passed in 14 files.
- New adapter and CLI coverage: 37 tests. Changed source, baseline, head, packet data, missing or extra IDs, missing placeholders, invalid ICU, unsafe tags and invalid output arguments are rejected.
- The CLI uses new private temporary directories and exclusive file creation. It does not accept an output path or overwrite the app catalog.
- `pnpm run format:fix`, `pnpm run lint:fix`, `pnpm run scheduler:cf-typegen`, `pnpm run typecheck` and `git diff --check` passed.
- Root inspection checked the module and CLI diff against the required contract. No blocking finding remained. This was not an independent review of the future live delivery workflow.

## Actual app check

An isolated detached worktree at `/tmp/jupiter-lingo-app-smoke.HIZsGW/worktree` received only a synthetic staged candidate in its Chinese catalog. This was local test data, not a new Lingo result or a human-approved translation.

Candidate: `/private/var/folders/f9/7_mrsyyx2jg1p48j5mwpzhh00000gn/T/jupiter-lingo-app-stage-JAURP6/candidate.po`.

The real `pnpm run build` compiled the PO with Lingui and built the TanStack app. The local Vite preview ran at `http://127.0.0.1:4179`.

- Chinese server response: HTTP 200, `lang="zh-Hans"`, expected `本地测试兑换审核` present, `Review swap` absent.
- English server response: HTTP 200, `lang="en"`, `Review swap` present, synthetic Chinese marker absent.
- Browser accessibility and screenshot checks showed the expected Chinese text on the actual swap button. The page also showed the Chinese plural route text and rehearsal proof.

The page's displayed commit is the detached base commit. Its catalog was locally modified. Do not present that commit label as a deployed revision or use this preview as live recording evidence.

## Limits

No paid generation, provider upload, Git push, merge, Worker creation or deployment occurred. The actual delivery gate, protected PR, correction retention, deployed verification, reset and full recording remain incomplete. The JSON route still does not send PO comments or a configured glossary to the engine.

The frontend test-selection skill limited verification to the real catalog-to-rendered-page contract. The reuse check retained the existing Lingui validators and kept the saved-fixture default. Local rendering results are not substituted for live protection or human review.
