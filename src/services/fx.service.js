/**
 * FX rate service — fetches EUR-based exchange rates from the backend.
 *
 * The backend proxies frankfurter.dev (no API key required).
 * Rates are cached in sessionStorage for 30 minutes.
 *
 * Rate format returned by the backend (GET /api/currencies):
 *   { amount: 1, base: "EUR", date: "...", rates: { USD: 1.08, CHF: 0.93, ... } }
 *
 * EUR is the base currency and is NOT included in the rates object (1 EUR = 1 EUR).
 *
 * Conversion formula (A → B via EUR base):
 *   if A === 'EUR':  amount * rates[B]
 *   if B === 'EUR':  amount / rates[A]
 *   otherwise:       amount * rates[B] / rates[A]
 *
 * IMPORTANT: Never fall back to 1:1 if a rate is missing.
 * Return null instead so the caller can signal an incomplete conversion.
 */

const CACHE_KEY = 'pfh_fx_rates_cache';
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch EUR-based FX rates from the backend.
 * Returns null if the backend is unreachable or the response is invalid.
 *
 * @returns {Promise<{ base: string, date: string, rates: Record<string, number> } | null>}
 */
export async function fetchFxRates() {
  // Check sessionStorage cache first
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_MAX_AGE_MS) {
        return parsed.data;
      }
    }
  } catch (_) {}

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let res;
    try {
      res = await fetch(`${apiUrl}/api/currencies`, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) return null;

    const data = await res.json();

    // frankfurter.dev format: { base, date, rates: { USD: ..., CHF: ... } }
    if (!data || typeof data.rates !== 'object') return null;

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (_) {}

    return data;
  } catch (_) {
    return null;
  }
}

/**
 * Convert an amount from one currency to another using EUR-based rates.
 *
 * Returns null if the conversion rate is unavailable — NEVER falls back to 1:1.
 *
 * @param {number} amount
 * @param {string} fromCurrency - ISO code (e.g., 'USD')
 * @param {string} toCurrency  - ISO code (e.g., 'CHF')
 * @param {{ rates: Record<string, number> } | null} fxData
 * @returns {number | null}
 */
// export function convertCurrency(amount, fromCurrency, toCurrency, fxData) {
//   if (fxData == null || typeof fxData.rates !== 'object') return null;
//   if (fromCurrency === toCurrency) return amount;

//   const { rates } = fxData;

//   // EUR is the implicit base (rate = 1.0)
//   const fromRate = fromCurrency === 'EUR' ? 1 : rates[fromCurrency];
//   const toRate   = toCurrency   === 'EUR' ? 1 : rates[toCurrency];

//   if (fromRate == null || toRate == null) return null;

//   // amount in fromCurrency → EUR → toCurrency
//   return (amount / fromRate) * toRate;
// }

export function convertCurrency(amount, fromCurrency, toCurrency, fxData) {
  if (!Array.isArray(fxData)) return null;

  if (fromCurrency === toCurrency) {
    return Number(amount);
  }

  const fromRate =
    fromCurrency === "EUR"
      ? 1
      : fxData.find(
          (r) =>
            r.base === "EUR" &&
            r.quote === fromCurrency
        )?.rate;

  const toRate =
    toCurrency === "EUR"
      ? 1
      : fxData.find(
          (r) =>
            r.base === "EUR" &&
            r.quote === toCurrency
        )?.rate;

  if (fromRate == null || toRate == null) {
    return null;
  }

  // fromCurrency → EUR → toCurrency
  return (
    (Number(amount) / Number(fromRate)) *
    Number(toRate)
  );
}
