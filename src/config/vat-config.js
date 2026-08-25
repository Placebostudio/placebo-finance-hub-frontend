/**
 * Country → standard VAT rate configuration.
 *
 * This is the single source of truth for country VAT rates.
 * Do NOT scatter VAT percentages across UI components.
 *
 * IMPORTANT: VAT explicitly printed on a receipt always overrides country defaults.
 * Countries may have reduced-rate categories not listed here — these are standard rates only.
 *
 * To add a country: add an entry to COUNTRY_VAT_RATES, COUNTRY_NAMES,
 * and optionally add detection rules to COUNTRY_DETECTION_RULES.
 */

// ── Country → standard VAT rate (percentage) ─────────────────────────────────
// null = country has no unified federal VAT (e.g. US, CA)

// ─────────────────────────────────────────────────────────────
// 1. Try to extract a city from OCR text
// ─────────────────────────────────────────────────────────────
function isPlaceholderLocation(text) {
  if (!text) return true;

  const value = text
    .trim()
    .toLowerCase();

  return (
    value.includes('town/city') ||
    value.includes('county') ||
    value.includes('street') ||
    value.includes('00000') ||
    value.includes('[address]') ||
    value.includes('[city]') ||
    value.includes('[country]')
  );
}

export function extractCity(text) {
  if (!text) return null;

  const lines = String(text)
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .filter(Boolean);

  const cityPatterns = [
    /,\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]+),?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?/i,
    /,\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]+),?\s+\d{5}(?:-\d{4})?/i,
  ];

  for (const line of lines) {

    // Ignore template placeholders
    if (isPlaceholderLocation(line)) {
      continue;
    }

    for (const pattern of cityPatterns) {
      const match = line.match(pattern);

      if (match?.[1] && !isPlaceholderLocation(match[1])) {
        return match[1].trim();
      }
    }
  }

  return null;
}


// ─────────────────────────────────────────────────────────────
// 2. Try to extract a street/address from OCR text
// ─────────────────────────────────────────────────────────────

export function extractAddress(text) {
  if (!text) return null;

  const lines = String(text)
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .filter(Boolean);

  // Examples:
  // "4840 SHAWLINE ST"
  // "1 Titans Way"
  // "10 Herzl Street"
  const addressPattern =
    /^\d+[A-Za-z]?\s+[A-Za-zÀ-ÿ0-9\s.'-]+(?:\s+(?:ST|STREET|RD|ROAD|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|LN|LANE|WAY|CT|COURT|PL|PLACE|HWY|HIGHWAY))?$/i;

  for (const line of lines) {
    if (addressPattern.test(line)) {
      return line;
    }
  }

  return null;
}


// ─────────────────────────────────────────────────────────────
// 3. Send a city/address to Nominatim
// ─────────────────────────────────────────────────────────────

export async function geocode(query) {
  if (!query) return null;

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(query)}` +
    `&format=jsonv2` +
    `&addressdetails=1` +
    `&limit=1`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`);
  }

  const results = await response.json();

  if (!results.length) {
    return null;
  }

  const result = results[0];

  return {
    countryCode: result.address?.country_code?.toUpperCase() ?? null,
    country: result.address?.country ?? null,
    city:
      result.address?.city ??
      result.address?.town ??
      result.address?.village ??
      null,
    displayName: result.display_name ?? null,
  };
}

export const COUNTRY_VAT_RATES = {
  US: null,   // No federal VAT
  CA: null,   // Federal GST 5%, provincial varies

  
  CH: 8.1,    // Switzerland
  KR: 10,     // South Korea
  IL: 18,     // Israel
  DE: 19,     // Germany
  RO: 19,     // Romania
  FR: 20,     // France
  GB: 20,     // United Kingdom
  AT: 20,     // Austria
  ES: 21,     // Spain
  NL: 21,     // Netherlands
  BE: 21,     // Belgium
  IT: 22,     // Italy
  PT: 23,     // Portugal
  PL: 23,     // Poland
  SE: 25,     // Sweden
  DK: 25,     // Denmark
  NO: 25,     // Norway
  FI: 25.5,    // Finland
  HU: 27,      // Hungary
};

export const COUNTRY_NAMES = {
  IL: 'Israel',
  SE: 'Sweden',
  DE: 'Germany',
  FR: 'France',
  GB: 'United Kingdom',
  NL: 'Netherlands',
  BE: 'Belgium',
  AT: 'Austria',
  DK: 'Denmark',
  NO: 'Norway',
  FI: 'Finland',
  IT: 'Italy',
  ES: 'Spain',
  PT: 'Portugal',
  PL: 'Poland',
  CZ: 'Czech Republic',
  HU: 'Hungary',
  RO: 'Romania',
  CH: 'Switzerland',
  US: 'United States',
  CA: 'Canada',
};

// ── Country detection rules ───────────────────────────────────────────────────
//
// Ordered from most specific to least specific within each country.
// Each rule has a confidence level:
//   high   — unique identifier on the receipt (VAT/business number, phone country code)
//   medium — country name, major city name
//   low    — currency symbol (not always unique; NOT used to infer VAT rates)
//
// The detector picks the highest-confidence match overall.

export const COUNTRY_DETECTION_RULES = [
  // ── Israel ──────────────────────────────────────────────────────────────────
  {
    code: 'IL', confidence: 'high', reason: 'Israeli business/VAT registration number',
    patterns: [
      /עוסק\s*מורשה\s*:?\s*\d{9}/i,
      /מספר\s*עוסק\s*:?\s*\d{9}/i,
      /ח\.פ\.\s*\d{9}/,
      /ע\.מ\.\s*\d{9}/i,
    ],
  },
  {
    code: 'IL', confidence: 'high', reason: 'Israeli phone country code (+972)',
    patterns: [/\+972[\s\-\d(]/, /\(\s*0?972\s*\)/],
  },
  {
    code: 'IL', confidence: 'medium', reason: 'Country name "Israel" on receipt',
    patterns: [/\b(ישראל|israel)\b/i],
  },
  {
    code: 'IL', confidence: 'medium', reason: 'Israeli city name on receipt',
    patterns: [
      /\b(tel[\s\-]?aviv|תל[\s\-]?אביב|jerusalem|ירושלים|haifa|חיפה|bnei?\s*brak|בני[\s\-]?ברק|holon|חולון|petah|petach|פתח[\s\-]?תקווה|rishon|ראשון|rehovot|רחובות|ashdod|אשדוד|beer[\s\-]?sheva|באר[\s\-]?שבע|bat[\s\-]?yam|בת[\s\-]?ים|modiin|מודיעין)\b/i,
    ],
  },
  {
    code: 'IL', confidence: 'low', reason: 'Israeli Shekel (ILS/₪) currency symbol',
    patterns: [/\bils\b/i, /₪/, /ש"ח/, /\bnis\b/i],
  },

  // ── Sweden ───────────────────────────────────────────────────────────────────
  {
    code: 'SE', confidence: 'high', reason: 'Swedish VAT number (SE + 12 digits)',
    patterns: [
      /\bSE\d{10}01\b/,
      /momsreg\.?\s*nr\.?\s*:?\s*SE\d{12}/i,
      /org\.?\s*nr\.?\s*:?\s*\d{6}[\s\-]\d{4}/i,
    ],
  },
  {
    code: 'SE', confidence: 'high', reason: 'Swedish phone country code (+46)',
    patterns: [/\+46[\s\-\d(]/],
  },
  {
    code: 'SE', confidence: 'medium', reason: 'Country name "Sweden" on receipt',
    patterns: [/\b(sverige|sweden)\b/i],
  },
  {
    code: 'SE', confidence: 'medium', reason: 'Swedish city name on receipt',
    patterns: [/\b(stockholm|göteborg|gothenburg|malmö|malmo|uppsala|västerås|vasteras|örebro|orebro|linköping|linkoping|helsingborg|norrkoping|norrköping)\b/i],
  },
  {
    code: 'SE', confidence: 'low', reason: 'Swedish Krona (SEK) currency',
    patterns: [/\bsek\b/i],
  },

  // ── Germany ───────────────────────────────────────────────────────────────────
  {
    code: 'DE', confidence: 'high', reason: 'German VAT number (DE + 9 digits)',
    patterns: [
      /\bDE\d{9}\b/,
      /ust\.?[-\s]?id\.?\s*(?:nr\.?)?\s*:?\s*DE\d{9}/i,
      /umsatzsteuer[-\s]?id/i,
      /steuernummer\s*:?\s*[\d\/]+/i,
    ],
  },
  {
    code: 'DE', confidence: 'high', reason: 'German phone country code (+49)',
    patterns: [/\+49[\s\-\d(]/],
  },
  {
    code: 'DE', confidence: 'medium', reason: 'Country name "Germany" on receipt',
    patterns: [/\b(deutschland|germany)\b/i],
  },

  // ── France ────────────────────────────────────────────────────────────────────
  {
    code: 'FR', confidence: 'high', reason: 'French VAT number or SIRET',
    patterns: [
      /\bFR[A-Z0-9]{2}\s?\d{9}\b/,
      /n[°o]?\s*tva\s*:?\s*FR/i,
      /siret\s*:?\s*\d{14}/i,
    ],
  },
  {
    code: 'FR', confidence: 'high', reason: 'French phone country code (+33)',
    patterns: [/\+33[\s\-\d(]/],
  },
  {
    code: 'FR', confidence: 'medium', reason: 'Country name "France" on receipt',
    patterns: [/\b(france)\b/i],
  },

  // ── United Kingdom ────────────────────────────────────────────────────────────
  {
    code: 'GB', confidence: 'high', reason: 'UK VAT number (GB + 9 digits)',
    patterns: [
      /\bGB\d{9}\b/,
      /vat\s*reg\.?\s*(?:no\.?)?\s*:?\s*GB\d{9}/i,
    ],
  },
  {
    code: 'GB', confidence: 'high', reason: 'UK phone country code (+44)',
    patterns: [/\+44[\s\-\d(]/],
  },
  {
    code: 'GB', confidence: 'medium', reason: 'Country name on receipt',
    patterns: [/\b(united\s*kingdom|england|scotland|wales|great\s*britain)\b/i],
  },
  {
    code: 'GB', confidence: 'low', reason: 'British Pound (GBP/£) currency',
    patterns: [/£/, /\bgbp\b/i, /\bsterling\b/i],
  },

  // ── Switzerland ───────────────────────────────────────────────────────────────
  {
    code: 'CH', confidence: 'high', reason: 'Swiss VAT/UID number',
    patterns: [
      /\bCHE[-.\s]?\d{3}[.\s]\d{3}[.\s]\d{3}\b/,
      /uid\s*:?\s*CHE/i,
      /mwst[-\s]?nr/i,
    ],
  },
  {
    code: 'CH', confidence: 'high', reason: 'Swiss phone country code (+41)',
    patterns: [/\+41[\s\-\d(]/],
  },
  {
    code: 'CH', confidence: 'medium', reason: 'Country name on receipt',
    patterns: [/\b(schweiz|switzerland|suisse|svizzera)\b/i],
  },
  {
    code: 'CH', confidence: 'low', reason: 'Swiss Franc (CHF) currency',
    patterns: [/\bchf\b/i],
  },

  // ── Netherlands ───────────────────────────────────────────────────────────────
  {
    code: 'NL', confidence: 'high', reason: 'Dutch VAT number (NL + 9 digits + B + 2)',
    patterns: [/\bNL\d{9}B\d{2}\b/, /btw[-\s]?nr\.?\s*:?\s*NL/i],
  },
  {
    code: 'NL', confidence: 'high', reason: 'Dutch phone country code (+31)',
    patterns: [/\+31[\s\-\d(]/],
  },
  {
    code: 'NL', confidence: 'medium', reason: 'Country name on receipt',
    patterns: [/\b(nederland|netherlands|holland)\b/i],
  },
  // ── Spain ─────────────────────────────────────────────────────────────────────

  {
    code: 'ES', confidence: 'medium', reason: 'Spanish city name on receipt',
    patterns: [
      /\b(madrid|barcelona|valencia|sevilla|seville|zaragoza|málaga|malaga|alicante|bilbao|murcia|palma|granada)\b/i,
    ],
  },

  {
    code: 'ES', confidence: 'medium', reason: 'Country name "Spain" on receipt',
    patterns: [
      /\b(spain|españa|espana)\b/i,
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/**
 * Detect the most likely country from receipt text.
 * Returns the highest-confidence match, or null if nothing is detected.
 *
 * @param {string} text - full extracted text
 * @returns {{ code: string, name: string, confidence: 'high'|'medium'|'low', reason: string } | null}
 */
export function detectCountry(text) {
  if (!text) return null;

  let best = null;

  for (const rule of COUNTRY_DETECTION_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      if (!best || CONFIDENCE_RANK[rule.confidence] > CONFIDENCE_RANK[best.confidence]) {
        best = {
          code: rule.code,
          name: COUNTRY_NAMES[rule.code] ?? rule.code,
          confidence: rule.confidence,
          reason: rule.reason,
        };
        // Short-circuit: can't do better than 'high'
        if (best.confidence === 'high') break;
      }
    }
  }

  return best;
}

/**
 * Get the standard VAT rate (%) for a country code.
 * Returns null if unknown or not applicable (e.g. US).
 *
 * @param {string} countryCode ISO 3166-1 alpha-2 code
 * @returns {number|null}
 */
export function getCountryVatRate(countryCode) {
  if (!countryCode) return null;
  const rate = COUNTRY_VAT_RATES[countryCode];
  return rate !== undefined ? rate : null;
}

/**
 * Get the human-readable name for a country code.
 *
 * @param {string} countryCode
 * @returns {string}
 */
export function getCountryName(countryCode) {
  return COUNTRY_NAMES[countryCode] ?? countryCode;
}
