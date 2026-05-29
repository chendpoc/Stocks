"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AgentInbox } from "@/components/cockpit/inbox/AgentInbox";
import { CockpitPageFallback } from "@/components/cockpit/shell/CockpitPageFallback";

function AgentInboxPageContent() {
  const searchParams = useSearchParams();
  const initialEventId = searchParams.get("eventId") ?? undefined;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <AgentInbox initialEventId={initialEventId} />
    </div>
  );
}

export default function AgentInboxPage() {
  return (
    <Suspense fallback={<CockpitPageFallback />}>
      <AgentInboxPageContent />
    </Suspense>
  );
}
