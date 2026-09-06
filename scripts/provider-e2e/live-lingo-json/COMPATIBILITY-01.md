# Lingo JSON compatibility attempt 1

Result: PASSED for transport, catalog structure, and local rendering. Human review, protected delivery, browser hydration, correction retention, reset, and full recording are not complete.

The user approved one generation from existing credit, with no automatic retry, top-up, or deployment. No further generation was started.

## Exact attempt

- CLI: `@lingo.dev/cli@1.16.0`, Node 24.16.0.
- Engine: `eng_s8sAdrF2lrMnWj94r7kd`.
- Group: `lrg_b42kvO7rjZdixQcWhBK7`.
- Job: `ljb_yuFG9A1X7dqCSWXRq6VR`.
- Command: `lingo push --backfill-missing`, then `lingo pull` for the same saved group. No force option.
- Provider start: 2026-09-06 19:25:20.417 UTC.
- Provider completion: 2026-09-06 19:26:06.363 UTC.
- Provider status: completed; no warnings or missing artifacts.
- Model: Anthropic `claude-sonnet-4.6`.
- Tokens: 1,966 input; 284 output; 1,516 cache write; zero cache read.
- Estimate: USD 0.0095. API `costUsd` is null. The settled cost is unknown.

| File                                                   | SHA-256                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| [English JSON](./locales/en.json)                      | `10d0d2f95ecc91bfd05733997b1c45573f4fd468167032df8a4de8775f62c378` |
| [Untouched Chinese JSON draft](./locales/zh-Hans.json) | `617f491a8ad147c94612dad71e8d090f46623cd5a44d077835504675f7fb4df5` |
| [Derived Chinese PO](./derived/zh-Hans.po)             | `2ff9e41327943631c0c08945cbf0defd9725628c09fc6816a6c60ac0502a62e1` |

A read-only API check on 7 September 2026 Singapore time confirmed that the provider source and target hashes match these local JSON files. The original PO source hash is `1c99ecd43b9ff06f2958e7aa3b5ea1a169847cfe1f8c71ad9c9453b94c1ba1a1`.

## Checks

The real Lingui validator accepted all 14 source and target IDs. Source comments, ICU arguments, select keys, placeholders, and allowed React tags survived the conversion. The glossary check used an empty term list because no glossary was configured or approved.

Real local Lingui and React rendering produced:

- Fee: `网络费用：0.000005 SOL`.
- Route count: `3 条可用路线`.
- Failed status: `交易失败`.
- Received amount: `您将收到 10 USDC`.
- Link: `确认前请阅读 <a href="/test-details">交易详情</a>。`.

These are format and local rendering checks. They do not prove Chinese language quality, browser behavior, or approval.

## Comparison limits

This route requires custom JSON-to-PO integration. Do not report it as native explicit-ID PO support. The native PO failure remains unchanged in its separate evidence directory.

The provider received English JSON strings, not the PO comments. Restored comments were copied from the original source after generation. The model did not receive those comments through this input. Equivalent context and glossary are still required for a fair quality comparison.

No raw recording of the generation step was made. A later inspection clip cannot replace that missing action. A complete final walkthrough needs a fresh, separately approved generation after the safety workflow is ready.

No human approval, Git push, merge, deployment, or complete provider recording was made in this attempt.
