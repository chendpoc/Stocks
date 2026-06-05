import {
  getMarketState,
  ingestMarketPlaneSymbol,
  listMarketPlaneSymbols,
} from "../services/liveMarketPlane.js";
import { printJson } from "../ui/display.js";

export async function marketPlane(action: string, symbol?: string): Promise<void> {
  if (action === "symbols") {
    printJson("M2 symbols", await listMarketPlaneSymbols());
    return;
  }
  if (!symbol) {
    throw new Error("market-plane requires a symbol for state|ingest");
  }
  if (action === "state") {
    printJson(`Market state ${symbol}`, await getMarketState(symbol));
    return;
  }
  if (action === "ingest") {
    printJson(`Ingest ${symbol}`, await ingestMarketPlaneSymbol(symbol));
    return;
  }
  throw new Error(`Unknown market-plane action: ${action}`);
}
