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
