import { useLingui } from "@lingui/react";
import { useState } from "react";

import {
  ONBOARD_BUY_DESCRIPTION_MESSAGE,
  ONBOARD_BUY_TITLE_MESSAGE,
  ONBOARD_CEX_DESCRIPTION_MESSAGE,
  ONBOARD_CEX_TITLE_MESSAGE,
  ONBOARD_MORE_WAYS_MESSAGE,
  ONBOARD_PROTECTED_VALUES,
  ONBOARD_SUBTITLE_MESSAGE,
  ONBOARD_TITLE_MESSAGE,
  ONBOARD_UNAVAILABLE_MESSAGE,
  ONBOARD_WALLET_STATE_MESSAGE,
} from "../i18n/messages";
import { SandboxMessageId } from "../message-metadata";
import type { SandboxMessageId as SandboxMessageIdValue } from "../message-metadata";

import { SelectableMessage } from "./SelectableMessage";
import { UiIcon } from "./UiIcon";
import { cn } from "./ui";

const WalletState = {
  FUNDED: "funded",
  NEW: "new",
} as const;

type WalletState = (typeof WalletState)[keyof typeof WalletState];

type DepositAvailability = { kind: "available" } | { kind: "unavailable" };

type OnboardExampleProps = {
  onMessageSelect: (messageId: SandboxMessageIdValue) => void;
  selectedMessageId: SandboxMessageIdValue;
  translationMode: boolean;
};

export const OnboardExample: React.FC<OnboardExampleProps> = ({
  onMessageSelect,
  selectedMessageId,
  translationMode,
}) => {
  const { i18n } = useLingui();
  const [availability, setAvailability] = useState<DepositAvailability>({ kind: "available" });
  const [walletState, setWalletState] = useState<WalletState>(WalletState.NEW);
  const walletStateCopy = i18n._({
    ...ONBOARD_WALLET_STATE_MESSAGE,
    values: { walletState },
  });

  return (
    <section className="w-full max-w-4xl pb-8">
      <div className="text-center">
        <h1 className="text-xl font-bold text-neutral-100 md:text-2xl">
          <SelectableMessage
            messageId={SandboxMessageId.ONBOARD_TITLE}
            onSelect={onMessageSelect}
            selected={selectedMessageId === SandboxMessageId.ONBOARD_TITLE}
            translationMode={translationMode}
          >
            {i18n._({ ...ONBOARD_TITLE_MESSAGE, values: ONBOARD_PROTECTED_VALUES })}
          </SelectableMessage>
        </h1>
        <p className="mt-1 text-sm font-medium text-neutral-400 md:text-lg">
          <SelectableMessage
            messageId={SandboxMessageId.ONBOARD_SUBTITLE}
            onSelect={onMessageSelect}
            selected={selectedMessageId === SandboxMessageId.ONBOARD_SUBTITLE}
            translationMode={translationMode}
          >
            {i18n._({ ...ONBOARD_SUBTITLE_MESSAGE, values: ONBOARD_PROTECTED_VALUES })}
          </SelectableMessage>
        </p>
      </div>

      {translationMode && (
        <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-info/20 bg-info/5 px-3 py-2 text-xs text-mid-foreground">
          <span className="font-medium text-info">Protected content</span>
          <span className="ml-2">Jupiter · Solana · SOL · USDC · product names · URLs</span>
        </div>
      )}

      <div className="mx-auto mt-6 max-w-[600px] rounded-[32px] border border-border bg-neutral-950 p-4 shadow-2xl shadow-black/20 sm:p-5">
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-100">Deposit</h2>
            <span className="rounded-md bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">
              Preview
            </span>
          </div>
          <div
            aria-label="Deposit preview state"
            className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5"
            role="group"
          >
            <PreviewButton
              active={availability.kind === "available"}
              label="Methods"
              onClick={() => setAvailability({ kind: "available" })}
            />
            <PreviewButton
              active={availability.kind === "unavailable"}
              label="Empty state"
              onClick={() => {
                setAvailability({ kind: "unavailable" });
                if (translationMode) onMessageSelect(SandboxMessageId.ONBOARD_UNAVAILABLE);
              }}
            />
          </div>
        </div>

        {availability.kind === "available" ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-neutral-900 p-4">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Deposit to</span>
                <span className="text-primary">Solana</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-neutral-800 text-neutral-300">
                  <UiIcon className="size-5" name="wallet" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-200">Connected wallet preview</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">9WzD...sandbox</p>
                </div>
                <UiIcon className="ml-auto size-4 text-neutral-500" name="caret-down" />
              </div>
            </div>
            <div className="rounded-2xl bg-big-input p-4">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Amount</span>
                <span>Fixed test data</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[32px] font-medium leading-none tracking-tight text-neutral-100">
                    100
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">$100.00</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-neutral-100">
                  <span className="flex size-8 items-center justify-center rounded-full bg-[#2775ca] text-xs font-bold text-white">
                    $
                  </span>
                  USDC
                  <UiIcon className="size-3 text-neutral-500" name="caret-down" />
                </div>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
            >
              Preview deposit
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-border-strong bg-neutral-900 px-5 py-12 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-secondary text-lg text-secondary-foreground">
              <UiIcon className="size-5" name="tray" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              <SelectableMessage
                messageId={SandboxMessageId.ONBOARD_UNAVAILABLE}
                onSelect={onMessageSelect}
                selected={selectedMessageId === SandboxMessageId.ONBOARD_UNAVAILABLE}
                translationMode={translationMode}
              >
                {i18n._(ONBOARD_UNAVAILABLE_MESSAGE)}
              </SelectableMessage>
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-border pt-4">
        <h2 className="text-center text-sm font-semibold text-muted-foreground sm:text-base">
          <SelectableMessage
            messageId={SandboxMessageId.ONBOARD_MORE_WAYS}
            onSelect={onMessageSelect}
            selected={selectedMessageId === SandboxMessageId.ONBOARD_MORE_WAYS}
            translationMode={translationMode}
          >
            {i18n._(ONBOARD_MORE_WAYS_MESSAGE)}
          </SelectableMessage>
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2 md:gap-5">
          <div className="rounded-xl border border-border-strong bg-neutral-950 p-4">
            <h3 className="text-center text-sm font-semibold text-neutral-200 md:text-lg">
              Funding an existing wallet? Start here
            </h3>
            <div className="mt-4 flex flex-col gap-3">
              <DepositMethodCard
                description={i18n._({
                  ...ONBOARD_BUY_DESCRIPTION_MESSAGE,
                  values: ONBOARD_PROTECTED_VALUES,
                })}
                descriptionId={SandboxMessageId.ONBOARD_BUY_DESCRIPTION}
                icon="credit-card"
                onMessageSelect={onMessageSelect}
                selectedMessageId={selectedMessageId}
                title={i18n._(ONBOARD_BUY_TITLE_MESSAGE)}
                titleId={SandboxMessageId.ONBOARD_BUY_TITLE}
                translationMode={translationMode}
              />
              <OrDivider />
              <DepositMethodCard
                description={i18n._({
                  ...ONBOARD_CEX_DESCRIPTION_MESSAGE,
                  values: ONBOARD_PROTECTED_VALUES,
                })}
                descriptionId={SandboxMessageId.ONBOARD_CEX_DESCRIPTION}
                icon="buildings"
                onMessageSelect={onMessageSelect}
                selectedMessageId={selectedMessageId}
                title={i18n._(ONBOARD_CEX_TITLE_MESSAGE)}
                titleId={SandboxMessageId.ONBOARD_CEX_TITLE}
                translationMode={translationMode}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border-strong bg-neutral-950 p-4">
            <h3 className="text-center text-sm font-semibold text-neutral-200 md:text-lg">
              Wallet state preview
            </h3>
            <div className="mt-4 rounded-lg bg-neutral-900 p-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 flex size-11 shrink-0 items-center justify-center rounded-full text-primary">
                  <UiIcon className="size-5" name="wallet" />
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Synthetic account state</p>
                  <p className="mt-1 font-semibold text-neutral-200">
                    <SelectableMessage
                      messageId={SandboxMessageId.ONBOARD_WALLET_STATE}
                      onSelect={onMessageSelect}
                      selected={selectedMessageId === SandboxMessageId.ONBOARD_WALLET_STATE}
                      translationMode={translationMode}
                    >
                      {walletStateCopy}
                    </SelectableMessage>
                  </p>
                </div>
              </div>
              <div
                aria-label="Wallet preview state"
                className="mt-4 flex w-full rounded-lg border border-neutral-800 bg-neutral-900 p-0.5"
                role="group"
              >
                <PreviewButton
                  active={walletState === WalletState.NEW}
                  label="New wallet"
                  onClick={() => {
                    setWalletState(WalletState.NEW);
                    if (translationMode) onMessageSelect(SandboxMessageId.ONBOARD_WALLET_STATE);
                  }}
                />
                <PreviewButton
                  active={walletState === WalletState.FUNDED}
                  label="Funded wallet"
                  onClick={() => {
                    setWalletState(WalletState.FUNDED);
                    if (translationMode) onMessageSelect(SandboxMessageId.ONBOARD_WALLET_STATE);
                  }}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-neutral-900 p-4 text-sm text-neutral-400">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
                <UiIcon className="size-4" name="shield" />
              </span>
              No wallet connection or funds are used in this sandbox.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

type DepositMethodCardProps = {
  description: string;
  descriptionId: SandboxMessageIdValue;
  icon: "buildings" | "credit-card";
  onMessageSelect: (messageId: SandboxMessageIdValue) => void;
  selectedMessageId: SandboxMessageIdValue;
  title: string;
  titleId: SandboxMessageIdValue;
  translationMode: boolean;
};

const DepositMethodCard: React.FC<DepositMethodCardProps> = ({
  description,
  descriptionId,
  icon,
  onMessageSelect,
  selectedMessageId,
  title,
  titleId,
  translationMode,
}) => {
  return (
    <div className="group flex items-center gap-4 rounded-lg border border-transparent bg-neutral-900 p-4 transition hover:border-primary-200">
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-neutral-300 md:text-base">
          <SelectableMessage
            messageId={titleId}
            onSelect={onMessageSelect}
            selected={selectedMessageId === titleId}
            translationMode={translationMode}
          >
            {title}
          </SelectableMessage>
          <UiIcon className="ml-1 inline-block size-3 text-neutral-500" name="arrow-up-right" />
        </h4>
        <p className="mt-2 text-xs leading-5 text-neutral-500 md:text-sm">
          <SelectableMessage
            messageId={descriptionId}
            onSelect={onMessageSelect}
            selected={selectedMessageId === descriptionId}
            translationMode={translationMode}
          >
            {description}
          </SelectableMessage>
        </p>
      </div>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-primary">
        <UiIcon className="size-5" name={icon} />
      </div>
    </div>
  );
};

const OrDivider: React.FC = () => {
  return (
    <div className="flex items-center gap-2">
      <span className="h-px flex-1 bg-neutral-800" />
      <span className="text-xs font-semibold text-neutral-500">or</span>
      <span className="h-px flex-1 bg-neutral-800" />
    </div>
  );
};

type PreviewButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

const PreviewButton: React.FC<PreviewButtonProps> = ({ active, label, onClick }) => {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
        active ? "bg-white/10 text-foreground" : "text-faint-foreground hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
};
