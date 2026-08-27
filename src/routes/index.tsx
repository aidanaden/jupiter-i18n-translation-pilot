import { createFileRoute, useNavigate } from '@tanstack/react-router';
import * as z from 'zod/v4-mini';

import { SandboxPrototype } from '../components/SandboxPrototype';
import { Locale } from '../i18n/runtime';
import { parseSandboxSearch, SandboxSearchInputSchema } from '../sandbox-search';
import type { SandboxPage, SandboxSearch } from '../sandbox-search';

const IndexPage: React.FC = () => {
  const navigate = useNavigate();
  const { locale, page } = Route.useSearch();

  const changeLocale = (nextLocale: Locale) => {
    void navigate({ replace: true, search: { locale: nextLocale, page }, to: '/' });
  };

  const changePage = (nextPage: SandboxPage) => {
    void navigate({ replace: true, search: { locale, page: nextPage }, to: '/' });
  };

  return (
    <SandboxPrototype
      key={page}
      locale={locale}
      onLocaleChange={changeLocale}
      onPageChange={changePage}
      page={page}
    />
  );
};

export const Route = createFileRoute('/')({
  validateSearch: (search): SandboxSearch => {
    const result = z.safeParse(SandboxSearchInputSchema, search);
    return parseSandboxSearch(result.success ? result.data : {});
  },
  beforeLoad: ({ context, search }) => {
    context.i18n.activate(search.locale);
  },
  component: IndexPage,
});
