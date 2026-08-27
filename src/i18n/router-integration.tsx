import type { I18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { AnyRouter } from "@tanstack/react-router";
import { Fragment, type PropsWithChildren } from "react";
import * as z from "zod/v4-mini";

import { Locale } from "./runtime";

const DehydratedI18nSchema = z.object({
  i18n: z.object({
    locale: z.enum(Locale),
  }),
});

type DehydratedI18n = z.infer<typeof DehydratedI18nSchema>;

export function dehydrateI18n(i18n: I18n): DehydratedI18n {
  const result = z.safeParse(DehydratedI18nSchema, {
    i18n: {
      locale: i18n.locale,
    },
  });
  if (!result.success) throw new Error("Cannot dehydrate an unsupported locale");
  return result.data;
}

export function hydrateI18n(i18n: I18n, dehydrated: DehydratedI18n): void {
  i18n.activate(dehydrated.i18n.locale);
}

export function addLinguiToRouter<TRouter extends AnyRouter>(router: TRouter, i18n: I18n): TRouter {
  const originalOptions = router.options;

  router.options = {
    ...originalOptions,
    context: {
      ...originalOptions.context,
      i18n,
    },
    Wrap: ({ children }: PropsWithChildren) => {
      const OriginalWrap = originalOptions.Wrap ?? Fragment;
      return (
        <I18nProvider i18n={i18n}>
          <OriginalWrap>{children}</OriginalWrap>
        </I18nProvider>
      );
    },
  };

  if (router.isServer) {
    router.options.dehydrate = async () => {
      const originalDehydrated = await originalOptions.dehydrate?.();
      return {
        ...originalDehydrated,
        ...dehydrateI18n(i18n),
      };
    };
  } else {
    router.options.hydrate = async (dehydrated) => {
      await originalOptions.hydrate?.(dehydrated);
      const result = z.safeParse(DehydratedI18nSchema, dehydrated);
      if (!result.success) throw new Error("Invalid dehydrated Lingui state");
      hydrateI18n(i18n, result.data);
    };
  }

  return router;
}
