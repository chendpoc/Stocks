import { PlaybookTheoriesWorkspace } from "@/components/cockpit/playbook-theories/PlaybookTheoriesWorkspace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlaybookTheoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <PlaybookTheoriesWorkspace initialTheoryId={firstParam(params["theoryId"])} />
    </div>
  );
}
