import { SignalsWorkspace } from "@/components/cockpit/signals/SignalsWorkspace";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignalsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <SignalsWorkspace initialSignalId={firstParam(params["signalId"])} />;
}
