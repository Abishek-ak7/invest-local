const PRICE_ENDPOINT = "https://api.twelvedata.com/price";
const MAX_SYMBOLS_PER_REQUEST = 8;

export function normalizeMarketSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

export async function fetchLatestPrices(symbols, apiKey) {
  const requestedSymbols = [...new Set(symbols.map(normalizeMarketSymbol).filter(Boolean))]
    .slice(0, MAX_SYMBOLS_PER_REQUEST);
  if (!requestedSymbols.length) return new Map();
  if (!String(apiKey || "").trim()) throw new Error("Add your Twelve Data API key in Settings first.");

  const query = new URLSearchParams({
    symbol: requestedSymbols.join(","),
    apikey: String(apiKey).trim()
  });
  const response = await fetch(`${PRICE_ENDPOINT}?${query}`, {
    headers: { Accept: "application/json" },
    referrerPolicy: "no-referrer"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status === "error") {
    throw new Error(payload?.message || "Live prices are unavailable right now.");
  }

  const prices = new Map();
  for (const symbol of requestedSymbols) {
    const quote = requestedSymbols.length === 1 ? payload : payload?.[symbol];
    const price = Number(quote?.price);
    if (Number.isFinite(price) && price > 0) prices.set(symbol, price);
  }
  if (!prices.size) throw new Error("No prices were returned. Check the investment symbols.");
  return prices;
}
