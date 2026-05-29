"use client";

import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CockpitPageFallback() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-md border border-border bg-surface/80">
      <span className="inline-flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        {t("shell.routeLoading")}
      </span>
    </div>
  );
}
