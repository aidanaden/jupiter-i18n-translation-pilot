import { setupI18n, type I18n } from '@lingui/core';

import { messages as pseudoMessages } from './locales/en-XA/messages';
import { messages as englishMessages } from './locales/en/messages';
import { messages as simplifiedChineseMessages } from './locales/zh-Hans/messages';

export const Locale = {
  ENGLISH: 'en',
  PSEUDO: 'en-XA',
  SIMPLIFIED_CHINESE: 'zh-Hans',
} as const;

export type Locale = (typeof Locale)[keyof typeof Locale];

export type SandboxRouterContext = {
  i18n: I18n;
};

export function createI18nInstance(): I18n {
  return setupI18n({
    locale: Locale.ENGLISH,
    messages: {
      [Locale.ENGLISH]: englishMessages,
      [Locale.PSEUDO]: pseudoMessages,
      [Locale.SIMPLIFIED_CHINESE]: simplifiedChineseMessages,
    },
  });
}
