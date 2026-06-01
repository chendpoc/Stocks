import { getMarketStatus, ingestMarket } from "../services/market.js";

export async function data(action: string) {
  switch (action) {
    case "status": {
      const status = await getMarketStatus();
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    case "ingest":
      console.log(JSON.stringify(await ingestMarket()));
      return;
    default:
      throw new Error(`Unknown data action: ${action} (use status|ingest)`);
  }
}
