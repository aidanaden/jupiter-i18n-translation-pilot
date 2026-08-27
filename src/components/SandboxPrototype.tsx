import { useState } from "react";

import { Locale } from "../i18n/runtime";
import { MESSAGE_METADATA, SandboxMessageId } from "../message-metadata";
import type { SandboxMessageId as SandboxMessageIdValue } from "../message-metadata";
import { SandboxPage } from "../sandbox-search";
import type { SandboxPage as SandboxPageValue } from "../sandbox-search";

import { JupiterLogo } from "./JupiterLogo";
import { OnboardExample } from "./OnboardExample";
import { SwapExample } from "./SwapExample";
import { UiIcon } from "./UiIcon";
import { Button, cn, Switch } from "./ui";

type SandboxPrototypeProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onPageChange: (page: SandboxPageValue) => void;
  page: SandboxPageValue;
};

export const SandboxPrototype: React.FC<SandboxPrototypeProps> = ({
  locale,
  onLocaleChange,
  onPageChange,
  page,
}) => {
  const [routeCount, setRouteCount] = useState<1 | 3>(3);
  const [selectedMessageId, setSelectedMessageId] = useState<SandboxMessageIdValue>(() =>
    page === SandboxPage.ONBOARD ? SandboxMessageId.ONBOARD_TITLE : SandboxMessageId.REVIEW_SWAP,
  );
  const [translationMode, setTranslationMode] = useState(locale === Locale.PSEUDO);

  const changeTranslationMode = (enabled: boolean) => {
    if (!enabled && locale === Locale.PSEUDO) onLocaleChange(Locale.ENGLISH);
    setTranslationMode(enabled);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppHeader onPageChange={onPageChange} page={page} />
      <div className="flex min-h-0 flex-1">
        <AppRail onPageChange={onPageChange} page={page} />
        <main
          className={cn(
            "flex min-h-0 w-full flex-1 items-start justify-center overflow-y-auto px-4 pb-44 pt-8 sm:px-6 sm:pb-52",
            page === SandboxPage.SWAP ? "sm:pt-[7vh]" : "sm:pt-12",
          )}
        >
          {page === SandboxPage.SWAP ? (
            <SwapExample
              onMessageSelect={setSelectedMessageId}
              routeCount={routeCount}
              selectedMessageId={selectedMessageId}
              translationMode={translationMode}
            />
          ) : (
            <OnboardExample
              onMessageSelect={setSelectedMessageId}
              selectedMessageId={selectedMessageId}
              translationMode={translationMode}
            />
          )}
        </main>
      </div>
      <TranslationDock
        locale={locale}
        onLocaleChange={onLocaleChange}
        onRouteCountChange={setRouteCount}
        onTranslationModeChange={changeTranslationMode}
        routeCount={routeCount}
        selectedMessageId={selectedMessageId}
        translationMode={translationMode}
      />
    </div>
  );
};

type AppHeaderProps = {
  onPageChange: (page: SandboxPageValue) => void;
  page: SandboxPageValue;
};

const AppHeader: React.FC<AppHeaderProps> = ({ onPageChange, page }) => {
  return (
    <header className="z-40 flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-2 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg text-neutral-400 sm:hidden"
        >
          <UiIcon className="size-5" name="menu" />
        </span>
        <div className="flex items-center gap-2">
          <JupiterLogo className="size-7 shrink-0" />
          <span className="hidden text-sm font-semibold text-neutral-100 sm:inline">Jupiter</span>
        </div>
        <span className="hidden rounded-full border border-warning/20 bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning sm:inline">
          Translation sandbox
        </span>
      </div>
      <nav
        aria-label="Sandbox pages"
        className="ml-auto flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 sm:ml-2"
      >
        <PageButton
          active={page === SandboxPage.SWAP}
          label="Swap"
          onClick={() => onPageChange(SandboxPage.SWAP)}
        />
        <PageButton
          active={page === SandboxPage.ONBOARD}
          label="Onboard"
          onClick={() => onPageChange(SandboxPage.ONBOARD)}
        />
      </nav>
      <div
        aria-hidden="true"
        className="ml-auto hidden h-9 w-full max-w-72 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 text-left text-xs text-neutral-500 lg:flex"
      >
        <UiIcon className="size-4" name="search" />
        Search tokens and addresses
        <span className="ml-auto rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-600">
          /
        </span>
      </div>
      <div className="flex items-center gap-1">
        <HeaderIcon icon="gift" />
        <HeaderIcon icon="settings" />
        <span
          aria-hidden="true"
          className="flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground sm:px-4"
        >
          Connect wallet
        </span>
      </div>
    </header>
  );
};

const HeaderIcon: React.FC<{ icon: "gift" | "settings" }> = ({ icon }) => {
  return (
    <span
      aria-hidden="true"
      className="hidden size-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 sm:flex"
    >
      <UiIcon className="size-4" name={icon} />
    </span>
  );
};

type PageButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

const PageButton: React.FC<PageButtonProps> = ({ active, label, onClick }) => {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition sm:px-4",
        active ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:text-neutral-200",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
};

const AppRail: React.FC<AppHeaderProps> = ({ onPageChange, page }) => {
  return (
    <aside
      aria-label="Jupiter navigation preview"
      className="hidden w-14 shrink-0 flex-col items-center border-r border-neutral-800 bg-neutral-950 py-3 md:flex"
    >
      <RailButton
        active={page === SandboxPage.SWAP}
        icon="swap"
        label="Swap"
        onClick={() => onPageChange(SandboxPage.SWAP)}
      />
      <RailButton
        active={page === SandboxPage.ONBOARD}
        icon="wallet"
        label="Onboard"
        onClick={() => onPageChange(SandboxPage.ONBOARD)}
      />
      <div className="my-3 h-px w-7 bg-neutral-800" />
      <RailIcon icon="chart" />
      <RailIcon icon="layers" />
      <RailIcon icon="more" />
    </aside>
  );
};

type RailButtonProps = {
  active: boolean;
  icon: "swap" | "wallet";
  label: string;
  onClick: () => void;
};

const RailButton: React.FC<RailButtonProps> = ({ active, icon, label, onClick }) => {
  return (
    <button
      aria-label={label}
      className={cn(
        "mb-1 flex size-10 items-center justify-center rounded-xl text-neutral-500 transition hover:bg-neutral-900 hover:text-neutral-200",
        active && "bg-neutral-800 text-primary",
      )}
      onClick={onClick}
      type="button"
    >
      <UiIcon className="size-5" name={icon} />
    </button>
  );
};

const RailIcon: React.FC<{ icon: "chart" | "layers" | "more" }> = ({ icon }) => {
  return (
    <span
      aria-hidden="true"
      className="mb-1 flex size-10 items-center justify-center rounded-xl text-neutral-500"
    >
      <UiIcon className="size-5" name={icon} />
    </span>
  );
};

type TranslationDockProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onRouteCountChange: (count: 1 | 3) => void;
  onTranslationModeChange: (enabled: boolean) => void;
  routeCount: 1 | 3;
  selectedMessageId: SandboxMessageIdValue;
  translationMode: boolean;
};

const TranslationDock: React.FC<TranslationDockProps> = ({
  locale,
  onLocaleChange,
  onRouteCountChange,
  onTranslationModeChange,
  routeCount,
  selectedMessageId,
  translationMode,
}) => {
  return (
    <aside
      aria-label="Translation controls"
      className="bg-neutral-900/95 relative z-50 mx-3 mb-3 max-w-2xl shrink-0 overflow-y-auto rounded-2xl border border-neutral-700 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:fixed sm:inset-x-3 sm:bottom-4 sm:mx-auto sm:mb-0"
      style={{ maxHeight: "calc(100vh - 2rem)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TranslationModeControl enabled={translationMode} onChange={onTranslationModeChange} />
        <LocaleControl
          locale={locale}
          onLocaleChange={onLocaleChange}
          showPseudo={translationMode}
        />
      </div>
      {translationMode && (
        <MessageInspector
          locale={locale}
          onRouteCountChange={onRouteCountChange}
          routeCount={routeCount}
          selectedMessageId={selectedMessageId}
        />
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] text-neutral-500">
        <span>Commit {__DEPLOYED_COMMIT__}</span>
        <span>Catalog {__CATALOG_TIMESTAMP__}</span>
      </div>
    </aside>
  );
};

const TranslationModeControl: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ enabled, onChange }) => {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-mid-foreground">
      <Switch
        aria-labelledby="translation-mode-label"
        checked={enabled}
        onCheckedChange={onChange}
        size="sm"
      />
      <span id="translation-mode-label">Translation mode</span>
    </div>
  );
};

type LocaleControlProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  showPseudo: boolean;
};

const LocaleControl: React.FC<LocaleControlProps> = ({ locale, onLocaleChange, showPseudo }) => {
  return (
    <div
      aria-label="Preview language"
      className="border-white/8 bg-white/3 flex items-center rounded-lg border p-0.5"
      role="group"
    >
      <LocaleButton
        active={locale === Locale.ENGLISH}
        label="EN"
        locale={Locale.ENGLISH}
        onLocaleChange={onLocaleChange}
      />
      <LocaleButton
        active={locale === Locale.SIMPLIFIED_CHINESE}
        label="简"
        locale={Locale.SIMPLIFIED_CHINESE}
        onLocaleChange={onLocaleChange}
      />
      {showPseudo && (
        <LocaleButton
          active={locale === Locale.PSEUDO}
          label="XA"
          locale={Locale.PSEUDO}
          onLocaleChange={onLocaleChange}
        />
      )}
    </div>
  );
};

type LocaleButtonProps = {
  active: boolean;
  label: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
};

const LocaleButton: React.FC<LocaleButtonProps> = ({ active, label, locale, onLocaleChange }) => {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "min-w-8 rounded-md px-2 py-1 text-xs font-medium transition",
        active ? "bg-white/10 text-neutral-100" : "text-faint-foreground hover:text-neutral-100",
      )}
      onClick={() => onLocaleChange(locale)}
      type="button"
    >
      {label}
    </button>
  );
};

type MessageInspectorProps = {
  locale: Locale;
  onRouteCountChange: (count: 1 | 3) => void;
  routeCount: 1 | 3;
  selectedMessageId: SandboxMessageIdValue;
};

const MessageInspector: React.FC<MessageInspectorProps> = ({
  locale,
  onRouteCountChange,
  routeCount,
  selectedMessageId,
}) => {
  const metadata = MESSAGE_METADATA[selectedMessageId];

  return (
    <section
      aria-label="Translation message details"
      className="mt-3 border-t border-white/10 pt-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="bg-primary/10 rounded-full px-2 py-1 text-xs font-medium text-primary">
          {metadata.kind}
        </span>
        <span className="text-xs text-faint-foreground">{locale}</span>
      </div>
      <code className="mt-3 block break-all text-xs text-mid-foreground">{selectedMessageId}</code>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{metadata.note}</p>

      {selectedMessageId === SandboxMessageId.MARKET_COUNT && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-faint-foreground">Plural value</span>
          <PreviewValueButton
            active={routeCount === 1}
            label="1"
            onClick={() => onRouteCountChange(1)}
          />
          <PreviewValueButton
            active={routeCount === 3}
            label="3"
            onClick={() => onRouteCountChange(3)}
          />
        </div>
      )}

      <Button className="mt-4 w-full" disabled size="sm" type="button" variant="secondary">
        Crowdin link pending
      </Button>
    </section>
  );
};

type PreviewValueButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

const PreviewValueButton: React.FC<PreviewValueButtonProps> = ({ active, label, onClick }) => {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "rounded-md px-2 py-1 text-xs",
        active ? "bg-primary text-primary-foreground" : "bg-white/6",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
};
