// ============================================================================
// OCR REFERENCE DATA
//
// localStorage is a continuously growing cache.
//
// The array is NOT static.
// New countries / currencies / languages are added when an external API
// provides information that is not already stored.
//
// Flow:
//
// OCR
//   ↓
// Check localStorage
//   ↓
// Found → use cached data
//   ↓
// Missing → call external API
//   ↓
// Add API result to array
//   ↓
// Save updated array to localStorage
// ============================================================================

const STORAGE_KEY = 'ocr_reference_data';

const ISO_CURRENCY_CODES = new Set([
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "UYU",
  "UZS",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XCD",
  "XOF",
  "XPF",
  "YER",
  "ZAR",
  "ZMW"
]);

// ============================================================================
// LOCAL STORAGE
// ============================================================================

export function getReferenceData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    return Array.isArray(parsed) ? parsed : [];

  } catch (error) {
    console.error(
      '[REFERENCE] Failed to read localStorage:',
      error
    );

    return [];
  }
}


export function saveReferenceData(data) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(data)
  );
}


// ============================================================================
// ADD / UPDATE REFERENCE DATA
// ============================================================================

export function addReferenceData(newItems) {
  if (!newItems) {
    return getReferenceData();
  }

  const existing = getReferenceData();

  const items = Array.isArray(newItems)
    ? newItems
    : [newItems];

  let updated = [...existing];

  for (const item of items) {
    if (!item) continue;

    const existingIndex = updated.findIndex(
      existingItem =>
        item.countryCode &&
        existingItem.countryCode &&
        existingItem.countryCode.toUpperCase() ===
          item.countryCode.toUpperCase()
    );

    // Existing country → merge new information
    if (existingIndex !== -1) {
      updated[existingIndex] = {
        ...updated[existingIndex],
        ...item
      };
    }

    // New country → add it
    else {
      updated.push(item);
    }
  }

  saveReferenceData(updated);

  console.log(
    '[REFERENCE] Store updated:',
    updated.length,
    'entries'
  );

  return updated;
}


// ============================================================================
// FIND COUNTRY IN LOCAL STORAGE
// ============================================================================

export function findCountry(countryCode) {
  if (!countryCode) {
    return null;
  }

  const normalized =
    String(countryCode).toUpperCase();

  const data = getReferenceData();

  return (
    data.find(
      item =>
        item.countryCode?.toUpperCase() === normalized
    ) ?? null
  );
}


// ============================================================================
// FIND CURRENCY IN LOCAL STORAGE
// ============================================================================

export function findCurrency(currencyCode) {
  if (!currencyCode) {
    return [];
  }

  const normalized =
    String(currencyCode).toUpperCase();

  const data = getReferenceData();

  return data.filter(
    item =>
      item.currencyCode?.toUpperCase() === normalized
  );
}


// ============================================================================
// FIND LANGUAGE IN LOCAL STORAGE
// ============================================================================

export function findLanguage(languageCode) {
  if (!languageCode) {
    return [];
  }

  const normalized =
    String(languageCode).toLowerCase();

  const data = getReferenceData();

  return data.filter(
    item =>
      item.languageCode?.toLowerCase() === normalized
  );
}


// ============================================================================
// SEARCH THE LOCAL STORE USING OCR TEXT
// ============================================================================

export function findReferenceInText(text) {
  if (!text) {
    return null;
  }

  const normalizedText =
    String(text).toLowerCase();

  const data = getReferenceData();

  for (const item of data) {

    // ------------------------------------------------------------
    // Country
    // ------------------------------------------------------------

    const countryMatches = [
      item.country,
      item.countryOfficialName,
      ...(item.countryAliases ?? [])
    ];

    for (const alias of countryMatches) {
      if (!alias) continue;

      if (
        normalizedText.includes(
          String(alias).toLowerCase()
        )
      ) {
        return {
          type: 'country',
          value: item
        };
      }
    }


    // ------------------------------------------------------------
    // Currency
    // ------------------------------------------------------------

    const currencyMatches = [
      item.currency,
      item.currencyCode,
      item.currencySymbol,
      ...(item.currencyAliases ?? [])
    ];

    for (const alias of currencyMatches) {
      if (!alias) continue;

      if (
        normalizedText.includes(
          String(alias).toLowerCase()
        )
      ) {
        return {
          type: 'currency',
          value: item
        };
      }
    }
  }

  return null;
}


// ============================================================================
// REST COUNTRIES API
//
// Current REST Countries API v5 requires an API key.
//
// Put your key in your environment/config.
// ============================================================================

const REST_COUNTRIES_API =
  'https://api.restcountries.com/v5.1';

let REST_COUNTRIES_API_KEY = null;


export function setRestCountriesApiKey(key) {
  REST_COUNTRIES_API_KEY = key;
}


// ============================================================================
// REST COUNTRIES REQUEST
// ============================================================================

async function restCountriesRequest(url) {

  const headers = {};

  if (REST_COUNTRIES_API_KEY) {
    headers.Authorization =
      `Bearer ${REST_COUNTRIES_API_KEY}`;
  }

  const response =
    await fetch(url, {
      method: 'GET',
      headers
    });

  if (!response.ok) {
    throw new Error(
      `REST Countries error: ${response.status}`
    );
  }

  return response.json();
}


// ============================================================================
// NORMALIZE COUNTRY
// ============================================================================

function normalizeCountry(country) {
  if (!country) {
    return null;
  }

  const currencies =
    country.currencies ?? {};

  const languages =
    country.languages ?? {};

  const currencyEntries =
    Object.entries(currencies);

  const languageEntries =
    Object.entries(languages);

  const primaryCurrency =
    currencyEntries[0] ?? null;

  const primaryLanguage =
    languageEntries[0] ?? null;

  return {

    // ------------------------------------------------------------
    // Country
    // ------------------------------------------------------------

    country:
      country.name?.common ?? null,

    countryOfficialName:
      country.name?.official ?? null,

    countryCode:
      country.cca2 ?? null,

    countryCode3:
      country.cca3 ?? null,


    // ------------------------------------------------------------
    // Country aliases
    // ------------------------------------------------------------

    countryAliases: [
      country.name?.common,
      country.name?.official,
      ...(country.altSpellings ?? [])
    ].filter(Boolean),


    // ------------------------------------------------------------
    // Languages
    // ------------------------------------------------------------

    language:
      primaryLanguage?.[1] ?? null,

    languageCode:
      primaryLanguage?.[0] ?? null,

    languages:
      languageEntries.map(
        ([code, name]) => ({
          code,
          name
        })
      ),


    // ------------------------------------------------------------
    // Currency
    // ------------------------------------------------------------

    currency:
      primaryCurrency?.[1]?.name ?? null,

    currencyCode:
      primaryCurrency?.[0] ?? null,

    currencySymbol:
      primaryCurrency?.[1]?.symbol ?? null,

    currencies:
      currencyEntries.map(
        ([code, currency]) => ({
          code,
          name: currency.name,
          symbol: currency.symbol ?? null
        })
      ),


    // ------------------------------------------------------------
    // Currency aliases
    // ------------------------------------------------------------

    currencyAliases:
      currencyEntries.flatMap(
        ([code, currency]) => [
          code,
          currency.name,
          currency.symbol
        ].filter(Boolean)
      ),


    // ------------------------------------------------------------
    // Other useful information
    // ------------------------------------------------------------

    capital:
      country.capital?.[0] ?? null,

    callingCodes:
      country.idd?.root
        ? [
            country.idd.root,
            ...(country.idd.suffixes ?? [])
          ]
        : [],

    timezones:
      country.timezones ?? [],

    flag:
      country.flag ?? null,

    fetchedAt:
      new Date().toISOString()
  };
}


// ============================================================================
// FETCH COUNTRY FROM EXTERNAL API
// ============================================================================

export async function fetchCountry(countryCode) {
  if (!countryCode) {
    return null;
  }

  const code =
    encodeURIComponent(
      String(countryCode).toUpperCase()
    );

  const url =
    `${REST_COUNTRIES_API}/alpha/${code}`;

  const result =
    await restCountriesRequest(url);

  if (!Array.isArray(result) || result.length === 0) {
    return null;
  }

  return normalizeCountry(result[0]);
}


// ============================================================================
// GET COUNTRY
//
// 1. Check localStorage.
// 2. If missing → external API.
// 3. Add API result to localStorage.
// ============================================================================

export async function getOrFetchCountry(countryCode) {
  if (!countryCode) {
    return null;
  }

  const local =
    findCountry(countryCode);

  if (local) {
    console.log(
      '[REFERENCE] Country found locally:',
      countryCode
    );

    return local;
  }

  console.log(
    '[REFERENCE] Country missing → API:',
    countryCode
  );

  const country =
    await fetchCountry(countryCode);

  if (!country) {
    return null;
  }

  addReferenceData(country);

  return country;
}


// ============================================================================
// FRANKFURTER API
//
// Free exchange-rate API.
// No API key required.
// ============================================================================

const FRANKFURTER_API =
  'https://api.frankfurter.dev/v2';


// ============================================================================
// GET EXCHANGE RATES
// ============================================================================

export async function fetchCurrencyRates(
  currencyCode
) {
  if (!currencyCode) {
    return null;
  }

  const code =
    encodeURIComponent(
      String(currencyCode).toUpperCase()
    );

  const response =
    await fetch(
      `${FRANKFURTER_API}/rates?base=${code}`
    );

  if (!response.ok) {
    throw new Error(
      `Frankfurter error: ${response.status}`
    );
  }

  return response.json();
}


// ============================================================================
// GET CURRENCY
//
// First checks localStorage.
//
// If currency exists:
//     return cached countries.
//
// If missing:
//     query external API,
//     normalize countries,
//     add them to localStorage.
// ============================================================================

export async function getOrFetchCurrency(currencyCode) {
  if (!currencyCode) {
    return [];
  }

  const code =
    String(currencyCode)
      .trim()
      .toUpperCase();

  const local =
    findCurrency(code);

  if (local.length > 0) {
    console.log(
      '[REFERENCE] Currency found locally:',
      code
    );

    return local;
  }

  // Check against ISO currency codes
  if (!ISO_CURRENCY_CODES.has(code)) {
    console.log(
      '[REFERENCE] Invalid ISO currency:',
      code
    );

    return [];
  }

  console.log(
    '[REFERENCE] Valid ISO currency missing locally:',
    code
  );

  const normalized = [{
    currencyCode: code
  }];

  addReferenceData(normalized);

  return normalized;
}

// ============================================================================
// GET LANGUAGE FROM COUNTRY
// ============================================================================

export async function getOrFetchLanguage(countryCode) {
  const country =
    await getOrFetchCountry(countryCode);

  if (!country) {
    return null;
  }

  return {
    language:
      country.language,

    languageCode:
      country.languageCode,

    languages:
      country.languages
  };
}


// ============================================================================
// INITIALIZE STORE
//
// Does NOT populate anything.
// It only makes sure localStorage contains an array.
// ============================================================================

export function initializeReferenceStore() {
  const data =
    getReferenceData();

  if (!Array.isArray(data)) {
    saveReferenceData([]);
    return [];
  }

  return data;
}


// ============================================================================
// CLEAR CACHE
// ============================================================================

export function clearReferenceData() {
  localStorage.removeItem(
    STORAGE_KEY
  );
}