import { describe, expect, it } from 'vitest';

import { Locale } from './i18n/runtime';
import { parseSandboxSearch, SandboxPage } from './sandbox-search';

describe('parseSandboxSearch', () => {
  it('preserves supported page and locale values', () => {
    expect(
      parseSandboxSearch({
        locale: Locale.SIMPLIFIED_CHINESE,
        page: SandboxPage.ONBOARD,
      }),
    ).toEqual({
      locale: Locale.SIMPLIFIED_CHINESE,
      page: SandboxPage.ONBOARD,
    });
  });

  it('defaults unsupported values to the Swap page in English', () => {
    expect(parseSandboxSearch({ locale: 'fr', page: 'portfolio' })).toEqual({
      locale: Locale.ENGLISH,
      page: SandboxPage.SWAP,
    });
  });
});
