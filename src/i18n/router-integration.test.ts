// @vitest-environment happy-dom

import type { I18n } from '@lingui/core';
import { useLingui } from '@lingui/react';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ONBOARD_BUY_DESCRIPTION_MESSAGE,
  ONBOARD_CEX_DESCRIPTION_MESSAGE,
  ONBOARD_CEX_TITLE_MESSAGE,
  ONBOARD_PROTECTED_VALUES,
  ONBOARD_SUBTITLE_MESSAGE,
  ONBOARD_TITLE_MESSAGE,
} from './messages';
import { addLinguiToRouter } from './router-integration';
import { createI18nInstance, Locale } from './runtime';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });

type TestRouterContext = {
  i18n: I18n;
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('Lingui router hydration', () => {
  it('keeps the pinned source copy exact and protected values unchanged in the pseudolocale', () => {
    const englishI18n = createI18nInstance();
    expect(englishI18n._({ ...ONBOARD_BUY_DESCRIPTION_MESSAGE, values: ONBOARD_PROTECTED_VALUES })).toBe(
      'Purchase SOL or USDC via Apple Pay, Google Pay, credit cards with your local currencies like USD, EUR',
    );
    expect(englishI18n._(ONBOARD_CEX_TITLE_MESSAGE)).toBe('Transfer funds from Exchanges');
    expect(englishI18n._({ ...ONBOARD_CEX_DESCRIPTION_MESSAGE, values: ONBOARD_PROTECTED_VALUES })).toBe(
      'Transfer your crypto funds from exchanges like Coinbase or Binance to your Solana wallet directly',
    );

    const pseudoI18n = createI18nInstance();
    pseudoI18n.activate(Locale.PSEUDO);
    const pseudoCopy = [
      pseudoI18n._({ ...ONBOARD_BUY_DESCRIPTION_MESSAGE, values: ONBOARD_PROTECTED_VALUES }),
      pseudoI18n._({ ...ONBOARD_CEX_DESCRIPTION_MESSAGE, values: ONBOARD_PROTECTED_VALUES }),
      pseudoI18n._({ ...ONBOARD_SUBTITLE_MESSAGE, values: ONBOARD_PROTECTED_VALUES }),
      pseudoI18n._({ ...ONBOARD_TITLE_MESSAGE, values: ONBOARD_PROTECTED_VALUES }),
    ].join(' ');

    for (const protectedValue of Object.values(ONBOARD_PROTECTED_VALUES)) {
      expect(pseudoCopy).toContain(protectedValue);
    }
  });

  it('renders Chinese on the first client render after hydrating the server locale', async () => {
    const serverI18n = createI18nInstance();
    serverI18n.activate(Locale.SIMPLIFIED_CHINESE);
    const serverRouter = createHydrationRouter(serverI18n, true, () => undefined);
    await serverRouter.load();
    const dehydrated = await serverRouter.options.dehydrate?.();
    if (!dehydrated) throw new Error('Expected dehydrated Lingui state');

    const clientI18n = createI18nInstance();
    const renderedLocales: string[] = [];
    const clientRouter = createHydrationRouter(clientI18n, false, (locale) => renderedLocales.push(locale));

    await clientRouter.options.hydrate?.(dehydrated);
    await clientRouter.load();
    root = createRoot(document);
    await act(async () => root?.render(createElement(RouterProvider, { router: clientRouter })));

    expect(renderedLocales).toEqual([Locale.SIMPLIFIED_CHINESE]);
    expect(document.documentElement.lang).toBe(Locale.SIMPLIFIED_CHINESE);
    expect(document.querySelector('output')?.textContent).toBe('通过 Jupiter 充值');
  });
});

function createHydrationRouter(i18n: I18n, isServer: boolean, onRender: (locale: string) => void) {
  const rootRoute = createRootRouteWithContext<TestRouterContext>()({
    component: TestDocument,
  });
  const indexRoute = createRoute({
    component: () => createElement(HydrationHarness, { onRender }),
    getParentRoute: () => rootRoute,
    path: '/',
  });

  return addLinguiToRouter(
    createRouter({
      context: { i18n },
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer,
      routeTree: rootRoute.addChildren([indexRoute]),
    }),
    i18n,
  );
}

function TestDocument() {
  const { i18n } = useLingui();
  return createElement('html', { lang: i18n.locale }, createElement('body', null, createElement(Outlet)));
}

function HydrationHarness({ onRender }: { onRender: (locale: string) => void }) {
  const { i18n } = useLingui();
  onRender(i18n.locale);
  return createElement('output', null, i18n._({ ...ONBOARD_TITLE_MESSAGE, values: ONBOARD_PROTECTED_VALUES }));
}
