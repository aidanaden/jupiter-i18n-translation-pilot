export const ONBOARD_PROTECTED_VALUES = {
  applePay: "Apple Pay",
  binance: "Binance",
  coinbase: "Coinbase",
  EUR: "EUR",
  googlePay: "Google Pay",
  jupiter: "Jupiter",
  solana: "Solana",
  SOL: "SOL",
  USD: "USD",
  USDC: "USDC",
} as const;

export const ONBOARD_BUY_DESCRIPTION_MESSAGE = /* i18n */ {
  comment:
    "Onboard method description captured from the pinned Jupiter baseline. Protected placeholders render as SOL, USDC, Apple Pay, Google Pay, USD, and EUR.",
  id: "baseline.onboard.buy-description",
  message:
    "Purchase {SOL} or {USDC} via {applePay}, {googlePay}, credit cards with your local currencies like {USD}, {EUR}",
};

export const ONBOARD_BUY_TITLE_MESSAGE = /* i18n */ {
  comment: "Onboard method title captured from the pinned Jupiter baseline.",
  id: "baseline.onboard.buy-title",
  message: "Buy crypto with local currencies",
};

export const ONBOARD_CEX_DESCRIPTION_MESSAGE = /* i18n */ {
  comment:
    "Onboard method description captured from the pinned Jupiter baseline. Protected placeholders render as Coinbase, Binance, and Solana.",
  id: "baseline.onboard.cex-description",
  message:
    "Transfer your crypto funds from exchanges like {coinbase} or {binance} to your {solana} wallet directly",
};

export const ONBOARD_CEX_TITLE_MESSAGE = /* i18n */ {
  comment: "Onboard method title captured from the pinned Jupiter baseline.",
  id: "baseline.onboard.cex-title",
  message: "Transfer funds from Exchanges",
};

export const ONBOARD_MORE_WAYS_MESSAGE = /* i18n */ {
  comment: "Onboard section heading captured from the pinned Jupiter baseline.",
  id: "baseline.onboard.more-ways",
  message: "More ways to deposit",
};

export const ONBOARD_SUBTITLE_MESSAGE = /* i18n */ {
  comment:
    "Onboard page subtitle captured from the pinned Jupiter baseline. The protected placeholder renders as Solana.",
  id: "baseline.onboard.subtitle",
  message: "The easiest way to get started on {solana}",
};

export const ONBOARD_TITLE_MESSAGE = /* i18n */ {
  comment:
    "Onboard page title captured from the pinned Jupiter baseline. The protected placeholder renders as Jupiter.",
  id: "baseline.onboard.title",
  message: "Deposit via {jupiter}",
};

export const REVIEW_SWAP_MESSAGE = /* i18n */ {
  comment: "Primary action that opens the fixed swap review in the translation sandbox.",
  id: "baseline.swap.review",
  message: "Review swap",
};

export const SWAP_PAY_MESSAGE = /* i18n */ {
  comment:
    "Swap form label above the token amount the user will spend. Token symbols and amounts are rendered separately and must not be translated.",
  id: "swap.form.pay",
  message: "You pay",
};

export const SWAP_RECEIVE_MESSAGE = /* i18n */ {
  comment:
    "Swap form label above the quoted token amount the user will receive. This is a quote, not a guaranteed amount.",
  id: "swap.form.receive",
  message: "You receive",
};

export const SWAP_BALANCE_MESSAGE = /* i18n */ {
  comment:
    "Available token balance beside a swap input. Preserve the {balance} placeholder exactly; it is a preformatted amount, not text to translate.",
  id: "swap.form.balance",
  message: "Balance {balance}",
};

export const SWAP_MARKET_MESSAGE = /* i18n */ {
  comment:
    "Swap order-type tab for an immediate swap at the current market quote. Market means an order type, not a marketplace.",
  id: "swap.form.market",
  message: "Market",
};

export const SWAP_LIMIT_MESSAGE = /* i18n */ {
  comment:
    "Swap order-type tab for an order with a specified execution price. Limit means a limit order, not a spending cap.",
  id: "swap.form.limit",
  message: "Limit",
};

export const SWAP_RECURRING_MESSAGE = /* i18n */ {
  comment:
    "Swap order-type tab for repeated scheduled orders. Use the team's preferred term for recurring investment orders.",
  id: "swap.form.recurring",
  message: "Recurring",
};

export const TRANSLATION_REHEARSAL_PROOF_MESSAGE = /* i18n */ {
  comment: "Synthetic proof message used only by the autonomous end-to-end translation rehearsal.",
  id: "pilot.recording.proof",
  message: "Review the quoted amount before you confirm this swap.",
};

export const ONBOARD_UNAVAILABLE_MESSAGE = /* i18n */ {
  comment: "Sandbox-only empty state shown without a network request.",
  id: "sandbox.onboard.unavailable",
  message: "No deposit methods are available in this preview.",
};

export const ONBOARD_WALLET_STATE_MESSAGE = /* i18n */ {
  comment: "Sandbox-only ICU select. Preserve the walletState variable.",
  id: "sandbox.onboard.wallet-state",
  message:
    "{walletState, select, new {Set up your first wallet} funded {Add funds to your wallet} other {Review your wallet}}",
};

export const ROUTE_MARKET_COUNT_MESSAGE = /* i18n */ {
  comment: "Number of synthetic markets used by the fixed route. Preserve the routeCount variable.",
  id: "sandbox.swap.market-count",
  message:
    "{routeCount, plural, one {This route uses # market} other {This route uses # markets}}.",
};
