"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearningWorkspace } from "@/components/cockpit/learning/LearningWorkspace";
import { CockpitPageFallback } from "@/components/cockpit/shell/CockpitPageFallback";

function LearningPageContent() {
  const searchParams = useSearchParams();
  const initialReviewId = searchParams.get("reviewId") ?? undefined;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <LearningWorkspace initialReviewId={initialReviewId} />
    </div>
  );
}

export default function LearningPage() {
  return (
    <Suspense fallback={<CockpitPageFallback />}>
      <LearningPageContent />
    </Suspense>
  );
}
