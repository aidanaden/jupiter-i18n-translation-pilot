import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  catalogs: [
    {
      exclude: ['<rootDir>/src/i18n/locales/**'],
      include: ['<rootDir>/src'],
      path: '<rootDir>/src/i18n/locales/{locale}/messages',
    },
  ],
  fallbackLocales: {
    default: 'en',
  },
  format: formatter({ lineNumbers: false }),
  locales: ['en', 'zh-Hans', 'en-XA'],
  orderBy: 'messageId',
  pseudoLocale: {
    append: ' ⟧',
    extend: 0.4,
    locale: 'en-XA',
    prepend: '⟦ ',
  },
  sourceLocale: 'en',
});
