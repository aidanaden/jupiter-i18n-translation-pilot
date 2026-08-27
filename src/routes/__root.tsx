import '../styles.css';

import { useLingui } from '@lingui/react';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import type { SandboxRouterContext } from '../i18n/runtime';

const RootComponent: React.FC = () => {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
};

const RootDocument: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { i18n } = useLingui();

  return (
    <html
      className="dark"
      lang={i18n.locale}
    >
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRouteWithContext<SandboxRouterContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: 'Jupiter translation sandbox prototype' },
    ],
  }),
});
