import { createRouter } from '@tanstack/react-router';

import { addLinguiToRouter } from './i18n/router-integration';
import { createI18nInstance } from './i18n/runtime';
import type { SandboxRouterContext } from './i18n/runtime';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const i18n = createI18nInstance();

  return addLinguiToRouter(
    createRouter({
      context: { i18n } satisfies SandboxRouterContext,
      routeTree,
      scrollRestoration: true,
    }),
    i18n,
  );
}
