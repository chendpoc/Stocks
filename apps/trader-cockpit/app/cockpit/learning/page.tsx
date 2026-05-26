import { LearningWorkspace } from "@/components/cockpit/learning/LearningWorkspace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LearningPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <LearningWorkspace initialReviewId={firstParam(params["reviewId"])} />;
}
