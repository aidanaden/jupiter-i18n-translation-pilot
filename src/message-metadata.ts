import {
  ONBOARD_BUY_DESCRIPTION_MESSAGE,
  ONBOARD_BUY_TITLE_MESSAGE,
  ONBOARD_CEX_DESCRIPTION_MESSAGE,
  ONBOARD_CEX_TITLE_MESSAGE,
  ONBOARD_MORE_WAYS_MESSAGE,
  ONBOARD_SUBTITLE_MESSAGE,
  ONBOARD_TITLE_MESSAGE,
  ONBOARD_UNAVAILABLE_MESSAGE,
  ONBOARD_WALLET_STATE_MESSAGE,
  REVIEW_SWAP_MESSAGE,
  ROUTE_MARKET_COUNT_MESSAGE,
} from "./i18n/messages";

export const SandboxMessageId = {
  GUIDE: "sandbox.translation.guide",
  MARKET_COUNT: ROUTE_MARKET_COUNT_MESSAGE.id,
  ONBOARD_BUY_DESCRIPTION: ONBOARD_BUY_DESCRIPTION_MESSAGE.id,
  ONBOARD_BUY_TITLE: ONBOARD_BUY_TITLE_MESSAGE.id,
  ONBOARD_CEX_DESCRIPTION: ONBOARD_CEX_DESCRIPTION_MESSAGE.id,
  ONBOARD_CEX_TITLE: ONBOARD_CEX_TITLE_MESSAGE.id,
  ONBOARD_MORE_WAYS: ONBOARD_MORE_WAYS_MESSAGE.id,
  ONBOARD_SUBTITLE: ONBOARD_SUBTITLE_MESSAGE.id,
  ONBOARD_TITLE: ONBOARD_TITLE_MESSAGE.id,
  ONBOARD_UNAVAILABLE: ONBOARD_UNAVAILABLE_MESSAGE.id,
  ONBOARD_WALLET_STATE: ONBOARD_WALLET_STATE_MESSAGE.id,
  REVIEW_SWAP: REVIEW_SWAP_MESSAGE.id,
} as const;

export type SandboxMessageId = (typeof SandboxMessageId)[keyof typeof SandboxMessageId];

type MessageMetadata = {
  kind: "Jupiter baseline" | "Sandbox example";
  note: string;
};

export const MESSAGE_METADATA = {
  [SandboxMessageId.GUIDE]: {
    kind: "Sandbox example",
    note: "Rich text. Preserve the <link> placeholder and its URL.",
  },
  [SandboxMessageId.MARKET_COUNT]: {
    kind: "Sandbox example",
    note: "ICU plural. Preserve the routeCount variable.",
  },
  [SandboxMessageId.ONBOARD_BUY_DESCRIPTION]: {
    kind: "Jupiter baseline",
    note: "Long mobile copy. Preserve every product and currency name.",
  },
  [SandboxMessageId.ONBOARD_BUY_TITLE]: {
    kind: "Jupiter baseline",
    note: "Deposit method title captured from the pinned Onboard baseline.",
  },
  [SandboxMessageId.ONBOARD_CEX_DESCRIPTION]: {
    kind: "Jupiter baseline",
    note: "Preserve Coinbase, Binance, and Solana.",
  },
  [SandboxMessageId.ONBOARD_CEX_TITLE]: {
    kind: "Jupiter baseline",
    note: "Deposit method title captured from the pinned Onboard baseline.",
  },
  [SandboxMessageId.ONBOARD_MORE_WAYS]: {
    kind: "Jupiter baseline",
    note: "Section heading captured from the pinned Onboard baseline.",
  },
  [SandboxMessageId.ONBOARD_SUBTITLE]: {
    kind: "Jupiter baseline",
    note: "Page subtitle. Preserve Solana.",
  },
  [SandboxMessageId.ONBOARD_TITLE]: {
    kind: "Jupiter baseline",
    note: "Page title. Preserve Jupiter.",
  },
  [SandboxMessageId.ONBOARD_UNAVAILABLE]: {
    kind: "Sandbox example",
    note: "Fixed empty state. No network request is made.",
  },
  [SandboxMessageId.ONBOARD_WALLET_STATE]: {
    kind: "Sandbox example",
    note: "ICU select. Preserve the walletState variable.",
  },
  [SandboxMessageId.REVIEW_SWAP]: {
    kind: "Jupiter baseline",
    note: "Primary Swap action captured from the pinned baseline.",
  },
} satisfies Record<SandboxMessageId, MessageMetadata>;
