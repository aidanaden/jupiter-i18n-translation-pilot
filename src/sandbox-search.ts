import * as z from 'zod/v4-mini';

import { Locale } from './i18n/runtime';

export const SandboxPage = {
  ONBOARD: 'onboard',
  SWAP: 'swap',
} as const;

const SandboxPageSchema = z.enum(SandboxPage);
const LocaleSchema = z.enum(Locale);
export const SandboxSearchInputSchema = z.object({
  locale: z.optional(z.unknown()),
  page: z.optional(z.unknown()),
});

export type SandboxPage = z.infer<typeof SandboxPageSchema>;
export type SandboxSearchInput = z.infer<typeof SandboxSearchInputSchema>;

export type SandboxSearch = {
  locale: Locale;
  page: SandboxPage;
};

export function parseSandboxSearch(search: SandboxSearchInput): SandboxSearch {
  const locale = z.safeParse(LocaleSchema, search.locale);
  const page = z.safeParse(SandboxPageSchema, search.page);

  return {
    locale: locale.success ? locale.data : Locale.ENGLISH,
    page: page.success ? page.data : SandboxPage.SWAP,
  };
}
