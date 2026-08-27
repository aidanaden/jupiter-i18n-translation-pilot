# Translation sandbox prototype

## Selected tester release

The prototype now uses one layout: a Jupiter-style test application with a translation dock. It replaces the earlier three-layout comparison.

The release has two fixed-data pages:

- Swap provides a short production-like flow, an ICU plural, and a rich-text placeholder.
- Onboard provides a copy-heavy flow, an ICU select, an empty state, and a larger set of Jupiter baseline messages.

Both pages use Jupiter UI's React, strict TypeScript, TanStack Start, Vite, Tailwind CSS 4, Lingui 6.6, and workspace UI components. The prototype does not connect to a wallet, request a quote, submit a transaction, call Crowdin, or deploy a public site.

The shell uses Jupiter's Tailwind preset, theme tokens, logo geometry, header proportions, desktop navigation rail, controls, and card hierarchy. Swap follows the production token-input proportions and primary-action treatment. Onboard follows the production deposit-panel and two-column deposit-method structure. The examples remain fixed-data reproductions rather than imports of production product behavior.

## Stable preview URLs

The `page` and `locale` query parameters define each preview:

- `?page=swap&locale=en`
- `?page=swap&locale=zh-Hans`
- `?page=onboard&locale=en`
- `?page=onboard&locale=zh-Hans`

Translation mode adds the generated `en-XA` choice. A direct `locale=en-XA` URL also renders the pseudo-locale, but the `XA` control stays hidden until Translation mode is active.

The router includes the active locale in its hydration data. Direct Simplified Chinese and pseudo-locale URLs therefore use the same catalog on the server and on the first client render.

## Tester controls

The translation dock is always visible. On small screens, the page scrolls above the dock so the controls do not cover the test content.

Normal mode exposes English and Simplified Chinese. Translation mode also exposes:

- generated `en-XA` copy for layout stress tests;
- selectable translatable messages;
- message IDs, translator notes, and source classification;
- protected-content labels;
- plural values `1` and `3` for the Swap route message.

The Onboard page also includes fixed controls for the new-wallet state, the funded-wallet state, available deposit methods, and the empty state.

The disabled `Crowdin link pending` button marks the future translation-vendor handoff. This release creates no Crowdin project, hosted test application, GitHub repository, or external account.

## Catalog scope

The release contains 12 messages:

- eight selected Jupiter baseline messages;
- one sandbox empty-state message;
- one ICU select message;
- one ICU plural message;
- one rich-text message.

English is the source locale. Simplified Chinese has translations for all 12 messages. Lingui generates `en-XA` during extraction.

Protected values include Jupiter, Solana, SOL, USDC, amounts, product names, and URLs. Translation mode identifies protected values but does not make them selectable. Catalog messages represent protected product, token, and currency names as placeholders so the generated pseudolocale leaves them unchanged.

## Verification evidence

The tester-ready release verification covered:

- both pages at 1440 by 900 and 390 by 844;
- English, Simplified Chinese, and `en-XA`;
- direct localized URLs and client-side page and locale changes;
- Translation mode visibility and one-click activation;
- message selection and inspector metadata;
- ICU plural values `1` and `3`;
- both wallet states and the Onboard empty state;
- the rich-text link placeholder;
- mobile content scrolling above the dock;
- no horizontal overflow, error overlay, or browser console error.

The later Jupiter styling pass rechecked Swap and Onboard at desktop size in English, Simplified Chinese, and `en-XA`, including Translation mode and the inspector. The in-app viewport control did not produce a reliable mobile capture for that pass. Responsive behavior is implemented with the repository breakpoints, but the styling pass does not claim a second mobile visual verification.

The focused checks pass:

- Lingui extraction: 12 messages and 0 missing Simplified Chinese translations;
- Vitest: 4 tests across the search parser, catalog contract, and locale hydration boundary;
- package typecheck;
- package lint and repository formatting;
- strict Lingui compilation;
- the production TanStack Start build and prerender.

The final checks use the repository-supported Node 22.22.3 runtime.

## Fixed points

The first prototype started from `0776a159f58d6cd4f6a313c0698db6f62da566bd` on `aidan/fe-175-internationalize-the-active-swap-journey-with-lingui`.

The tester-ready implementation started from `7c337b14f266877199a368e84ac65486abef46a8` on `aidan/prototype/i18n-translation-sandbox`.

## Work outside this release

This prototype does not prove translator permissions, vendor webhooks, automated catalog exports, GitHub Actions, or a public deployment. The external pilot must verify those parts after the team chooses a translation vendor and authorizes the required accounts.
