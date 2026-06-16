import {
  getMarketState,
  ingestMarketPlaneSymbol,
  listMarketPlaneSymbols,
  marketPlaneStreamStatus,
  startMarketPlaneStream,
  stopMarketPlaneStream,
} from "../services/liveMarketPlane.js";
import { user } from "../log/index.js";

export async function marketPlane(action: string, symbol?: string): Promise<void> {
  if (action === "symbols") {
    user.json("M2 symbols", await listMarketPlaneSymbols());
    return;
  }
  if (action === "stream-status") {
    user.json("Market plane WebSocket", await marketPlaneStreamStatus());
    return;
  }
  if (action === "stream-start") {
    user.json("Start Longbridge quote stream", await startMarketPlaneStream());
    return;
  }
  if (action === "stream-stop") {
    user.json("Stop Longbridge quote stream", await stopMarketPlaneStream());
    return;
  }
  if (!symbol) {
    throw new Error("market-plane requires a symbol for state|ingest");
  }
  if (action === "state") {
    user.json(`Market state ${symbol}`, await getMarketState(symbol));
    return;
  }
  if (action === "ingest") {
    user.json(`Ingest ${symbol}`, await ingestMarketPlaneSymbol(symbol));
    return;
  }
  throw new Error(`Unknown market-plane action: ${action}`);
}
