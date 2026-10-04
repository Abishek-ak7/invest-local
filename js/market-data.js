const PRICE_ENDPOINT = "https://api.twelvedata.com/price";
const EXCHANGE_RATE_ENDPOINT = "https://api.twelvedata.com/exchange_rate";
const MUTUAL_FUND_ENDPOINT = "https://api.mfapi.in/mf";
const MAX_SYMBOLS_PER_REQUEST = 8;

export function normalizeMarketSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

export function isMutualFundSchemeCode(value) {
  return /^\d{6}$/.test(normalizeMarketSymbol(value));
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

export async function fetchUsdInrRate(apiKey) {
  if (!String(apiKey || "").trim()) throw new Error("Add your Twelve Data API key in Settings first.");
  const query = new URLSearchParams({ symbol: "USD/INR", apikey: String(apiKey).trim() });
  const response = await fetch(`${EXCHANGE_RATE_ENDPOINT}?${query}`, {
    headers: { Accept: "application/json" },
    referrerPolicy: "no-referrer"
  });
  const payload = await response.json().catch(() => null);
  const rate = Number(payload?.rate);
  if (!response.ok || payload?.status === "error" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(payload?.message || "The live USD to INR rate is unavailable right now.");
  }
  return rate;
}

export async function fetchMutualFundNavs(schemeCodes) {
  const requestedCodes = [...new Set(schemeCodes.map(normalizeMarketSymbol).filter(isMutualFundSchemeCode))];
  if (!requestedCodes.length) return new Map();

  const results = await Promise.all(requestedCodes.map(async (schemeCode) => {
    try {
      const response = await fetch(`${MUTUAL_FUND_ENDPOINT}/${encodeURIComponent(schemeCode)}/latest`, {
        headers: { Accept: "application/json" },
        referrerPolicy: "no-referrer"
      });
      const payload = await response.json().catch(() => null);
      const latest = payload?.data?.[0];
      const price = Number(latest?.nav);
      if (!response.ok || payload?.status !== "SUCCESS" || !Number.isFinite(price) || price <= 0) return null;
      return [schemeCode, { price, date: latest.date || "", name: payload.meta?.scheme_name || "" }];
    } catch {
      return null;
    }
  }));

  const navs = new Map(results.filter(Boolean));
  if (!navs.size) throw new Error("Mutual-fund NAVs are unavailable right now. Check the AMFI scheme codes.");
  return navs;
}
