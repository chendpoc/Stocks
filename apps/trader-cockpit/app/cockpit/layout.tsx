"use client";

import { CockpitProviders } from "@/lib/cockpit/providers";
import { CockpitShell } from "@/components/cockpit/shell/CockpitShell";

export default function CockpitLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CockpitProviders>
      <CockpitShell>{children}</CockpitShell>
    </CockpitProviders>
  );
}
