"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlaybookTheoriesWorkspace } from "@/components/cockpit/playbook-theories/PlaybookTheoriesWorkspace";
import { CockpitPageFallback } from "@/components/cockpit/shell/CockpitPageFallback";

function PlaybookTheoriesPageContent() {
  const searchParams = useSearchParams();
  const initialTheoryId = searchParams.get("theoryId") ?? undefined;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <PlaybookTheoriesWorkspace initialTheoryId={initialTheoryId} />
    </div>
  );
}

export default function PlaybookTheoriesPage() {
  return (
    <Suspense fallback={<CockpitPageFallback />}>
      <PlaybookTheoriesPageContent />
    </Suspense>
  );
}
