"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SignalsWorkspace } from "@/components/cockpit/signals/SignalsWorkspace";
import { CockpitPageFallback } from "@/components/cockpit/shell/CockpitPageFallback";

function SignalsPageContent() {
  const searchParams = useSearchParams();
  const initialSignalId = searchParams.get("signalId") ?? undefined;

  return <SignalsWorkspace initialSignalId={initialSignalId} />;
}

export default function SignalsPage() {
  return (
    <Suspense fallback={<CockpitPageFallback />}>
      <SignalsPageContent />
    </Suspense>
  );
}
