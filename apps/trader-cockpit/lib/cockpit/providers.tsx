"use client";

import { I18nProvider as HeroI18nProvider } from "@heroui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { i18n } from "@/lib/i18n/i18n";

export function CockpitProviders({ children }: { children: ReactNode }) {
  const language = useCockpitUiStore((state) => state.language);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <I18nextProvider i18n={i18n}>
      <HeroI18nProvider locale={language}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </HeroI18nProvider>
    </I18nextProvider>
  );
}
