import { AgentInbox } from "@/components/cockpit/inbox/AgentInbox";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AgentInboxPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <AgentInbox initialEventId={firstParam(params["eventId"])} />;
}
