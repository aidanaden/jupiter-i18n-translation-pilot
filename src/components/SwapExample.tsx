import { Trans, useLingui } from '@lingui/react';

import { Button } from '@jup-ag/ui/components';
import { cn } from '@jup-ag/ui/utils';

import { REVIEW_SWAP_MESSAGE, ROUTE_MARKET_COUNT_MESSAGE } from '../i18n/messages';
import { SandboxMessageId } from '../message-metadata';
import type { SandboxMessageId as SandboxMessageIdValue } from '../message-metadata';

import { UiIcon } from './UiIcon';

type SwapExampleProps = {
  onMessageSelect: (messageId: SandboxMessageIdValue) => void;
  routeCount: 1 | 3;
  selectedMessageId: SandboxMessageIdValue;
  translationMode: boolean;
};

export const SwapExample: React.FC<SwapExampleProps> = ({
  onMessageSelect,
  routeCount,
  selectedMessageId,
  translationMode,
}) => {
  const { i18n } = useLingui();
  const routeCopy = i18n._({
    ...ROUTE_MARKET_COUNT_MESSAGE,
    values: { routeCount },
  });

  return (
    <section className="w-full max-w-[510px]">
      {translationMode && (
        <div className="mb-3 rounded-xl border border-info/20 bg-info/5 px-3 py-2 text-xs text-mid-foreground">
          <span className="font-medium text-info">Protected content</span>
          <span className="ml-2">Jupiter · SOL · USDC · amounts</span>
        </div>
      )}

      <div className="rounded-3xl border border-neutral-800 bg-neutral-950 p-2 shadow-2xl shadow-black/25">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-5">
            <span className="border-b-2 border-primary pb-2 text-sm font-semibold text-neutral-100">Market</span>
            <span className="pb-2 text-sm font-medium text-neutral-500">Limit</span>
            <span className="pb-2 text-sm font-medium text-neutral-500">Recurring</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="bg-primary/10 rounded-md px-2 py-1 text-[11px] font-semibold text-primary">Ultra</span>
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg text-neutral-500"
            >
              <UiIcon
                className="size-4"
                name="sliders"
              />
            </span>
          </div>
        </div>

        <TokenField
          amount="1.00"
          label="You pay"
          symbol="SOL"
          tokenClassName="from-[#9945ff] to-[#14f195]"
          usd="$142.81"
        />
        <div className="relative z-10 -my-2 flex justify-center">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-xl border-4 border-neutral-950 bg-neutral-800 text-neutral-100 shadow-lg"
          >
            <UiIcon
              className="size-4"
              name="swap"
            />
          </span>
        </div>
        <TokenField
          amount="142.36"
          label="You receive"
          symbol="USDC"
          tokenClassName="from-[#2775ca] to-[#66a3e0]"
          usd="$142.36"
        />

        <button
          aria-pressed={translationMode && selectedMessageId === SandboxMessageId.MARKET_COUNT}
          className={cn(
            'mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-neutral-500 transition',
            translationMode && 'hover:bg-primary/5',
            translationMode && selectedMessageId === SandboxMessageId.MARKET_COUNT && 'ring-primary/60 ring-1',
          )}
          disabled={!translationMode}
          onClick={() => translationMode && onMessageSelect(SandboxMessageId.MARKET_COUNT)}
          type="button"
        >
          <span>{routeCopy}</span>
          <span className="text-faint-foreground">0.01% price impact</span>
        </button>

        {translationMode && (
          <div
            className={cn(
              'border-primary/35 bg-primary/5 mx-1 mt-1 flex items-start gap-3 rounded-xl border border-dashed px-3 py-2 text-xs leading-5 text-muted-foreground',
              selectedMessageId === SandboxMessageId.GUIDE && 'ring-primary/40 border-primary ring-1',
            )}
          >
            <p className="min-w-0 flex-1">
              <Trans
                comment="Sandbox-only guidance. Preserve the link rich-text placeholder."
                components={{
                  link: (
                    <a
                      className="font-medium text-primary underline underline-offset-2"
                      href="#translation-guide"
                    />
                  ),
                }}
                id="sandbox.translation.guide"
                message="Read the <link>translation guide</link> before editing placeholders."
              />
            </p>
            <button
              aria-label="Edit translation guide message"
              aria-pressed={selectedMessageId === SandboxMessageId.GUIDE}
              className="border-primary/30 bg-primary/10 hover:bg-primary/15 shrink-0 rounded-md border px-2 py-0.5 font-medium text-primary"
              onClick={() => onMessageSelect(SandboxMessageId.GUIDE)}
              type="button"
            >
              Edit
            </button>
          </div>
        )}

        {translationMode ? (
          <Button
            className={cn(
              'mt-2 h-14 w-full rounded-xl text-base font-semibold',
              selectedMessageId === SandboxMessageId.REVIEW_SWAP &&
                'ring-2 ring-primary ring-offset-2 ring-offset-card',
            )}
            onClick={() => onMessageSelect(SandboxMessageId.REVIEW_SWAP)}
            type="button"
          >
            {i18n._(REVIEW_SWAP_MESSAGE)}
          </Button>
        ) : (
          <div className="mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground">
            {i18n._(REVIEW_SWAP_MESSAGE)}
          </div>
        )}
      </div>
    </section>
  );
};

type TokenFieldProps = {
  amount: string;
  label: string;
  symbol: string;
  tokenClassName: string;
  usd: string;
};

const TokenField: React.FC<TokenFieldProps> = ({ amount, label, symbol, tokenClassName, usd }) => {
  return (
    <div className="rounded-2xl bg-big-input px-4 py-5">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span>Balance 12.40</span>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <div>
          <div className="text-[32px] font-medium leading-none tracking-tight text-neutral-100">{amount}</div>
          <div className="mt-1 text-xs text-faint-foreground">{usd}</div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-neutral-100 shadow-sm">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-[10px] text-white',
              tokenClassName,
            )}
          >
            {symbol === 'SOL' ? 'S' : '$'}
          </span>
          {symbol}
          <UiIcon
            className="size-3 text-faint-foreground"
            name="caret-down"
          />
        </div>
      </div>
    </div>
  );
};
