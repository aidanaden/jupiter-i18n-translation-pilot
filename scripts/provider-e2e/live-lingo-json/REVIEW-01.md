# Lingo draft review 1

Status: UNREVIEWED. This sheet is not release authority. The existing user account is the temporary workflow-test reviewer. This does not prove qualified Chinese review or independent roles.

Review the exact draft with SHA-256 `617f491a8ad147c94612dad71e8d090f46623cd5a44d077835504675f7fb4df5`. The job is `ljb_yuFG9A1X7dqCSWXRq6VR`. The [result receipt](./COMPATIBILITY-01.md) records its source and derived PO hashes.

## Review steps

1. Read the English source and its [context comments](../live-lingo/locales/en.po).
2. Check every Chinese message for meaning, terms, and clear wording.
3. Record corrections in a separate working copy. Keep the first AI draft unchanged.
4. Check the corrected file again. A correction changes the approved content and needs a new hash.
5. Use the authenticated review step only when it shows that exact final content. No action on this sheet grants delivery permission.

The engine has no approved glossary. In particular, decide whether the terms for Swap, slippage, routes, and minimum amount match the terms used by Jupiter. The model did not receive the source comments through this JSON route.

| ID                  | English source                                                                                             | Untouched Chinese draft                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `swap.submit`       | Swap                                                                                                       | 兑换                                                                        |
| `swap.slippage`     | Slippage tolerance                                                                                         | 滑点容忍度                                                                  |
| `swap.warning`      | Your transaction may fail if the price changes.                                                            | 如果价格发生变化，您的交易可能会失败。                                      |
| `swap.fee`          | `Network fee: {fee} SOL`                                                                                   | `网络费用：{fee} SOL`                                                       |
| `wallet.balance`    | Balance                                                                                                    | 余额                                                                        |
| `wallet.connected`  | `Connected to {wallet}`                                                                                    | `已连接至 {wallet}`                                                         |
| `swap.routes`       | `{count, plural, one {# route available} other {# routes available}}`                                      | `{count, plural, other {# 条可用路线}}`                                     |
| `swap.status`       | `{status, select, pending {Transaction pending} failed {Transaction failed} other {Transaction complete}}` | `{status, select, pending {交易待处理} failed {交易失败} other {交易完成}}` |
| `swap.details`      | `Read <link>transaction details</link> before you confirm.`                                                | `确认前请阅读 <link>交易详情</link>。`                                      |
| `swap.irreversible` | `<strong>Transfers cannot be reversed.</strong> Check the address.`                                        | `<strong>转账不可撤销。</strong>请核对地址。`                               |
| `swap.product`      | Swap SOL for USDC on Jupiter                                                                               | 在 Jupiter 上将 SOL 兑换为 USDC                                             |
| `swap.confirm`      | Select "Confirm" to continue.                                                                              | 选择"确认"以继续。                                                          |
| `swap.receive`      | `You receive {amount} {token}`                                                                             | `您将收到 {amount} {token}`                                                 |
| `swap.minimum`      | The minimum amount received may differ from this estimate.                                                 | 实际最低到账金额可能与此估算有所不同。                                      |

No reviewer decision has been recorded. Do not infer approval from a successful build, this sheet, or an agent response.
