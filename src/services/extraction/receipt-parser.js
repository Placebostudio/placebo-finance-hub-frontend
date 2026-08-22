/**
 * Deterministic receipt / invoice parser.
 *
 * No AI. Uses keyword matching, regex, line proximity, and arithmetic validation.
 * Supports English and Hebrew labels.
 *
 * Field states:
 *   found   — extracted with reasonable confidence
 *   review  — extracted but uncertain, or inferred from country default; user should verify
 *   missing — not found in text
 *   invalid — found but failed arithmetic validation
 *
 * Every field result includes: { value, status, sourceText, method, page }
 * The country field also includes: { countryName, confidence, reason }
 */

import { detectCountry, extractAddress, extractCity, geocode, getCountryVatRate } from '@/config/vat-config';

// ── Keyword dictionaries (extend to add more languages) ──────────────────────

const DOCUMENT_TYPE_PATTERNS = {
  invoice: /\b(invoice|חשבונית|bill|billing|faktura|factura|rechnung)\b/i,

  receipt: /\b(receipt|קבלה|reçu|quittung|ricevuta|kvitto)\b/i,

  credit_note: /\b(credit\s*note|credit\s*memo|gutschrift|note\s*de\s*crédit)\b/i,

  withdrawal: /\b(withdrawal|withdraw|cash\s*withdrawal|משיכה)\b/i,

  deposit: /\b(deposit|cash\s*deposit|הפקדה)\b/i,
};

const INVOICE_NUMBER_PATTERNS = [
  // Invoice No / Invoice Number / Invoice #
  /(?:invoice|inv\.?)\s*(?:no\.?|number|num\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,30})/i,

  // Receipt No / Receipt Number / Receipt #
  /(?:receipt)\s*(?:no\.?|number|num\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,30})/i,

  // Order No / PO No
  /(?:order|po)\s*(?:no\.?|number|num\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,30})/i,

  // Hebrew labels
  /(?:חשבונית|קבלה|מספר)\s*(?:מספר)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,30})/i,

  // Explicit # followed by a number/code
  /#\s*([A-Z0-9][A-Z0-9\-\/]{3,30})\b/i,

  // Standalone invoice-like numeric IDs.
  // Requires at least one digit and either a separator or 6+ digits.
  /\b(\d{4,}(?:[-\/]\d{3,})+)\b/,
  /\b(\d{6,})\b/,
];

const DATE_LABEL_PATTERNS = [
  /(?:invoice|document|issued?|receipt|bill|billing|trans(?:action)?)\s*date\s*[:\-]?\s*(.+)/i,
  /(?:date|תאריך)\s*[:\-]\s*(.+)/i,
  /\bpayment\s+date\s*:?\s*(.+)$/i
];

const DUE_DATE_LABEL_PATTERNS = [
  /(?:due|payment|pay\s+by|due\s+date)\s*[:\-]?\s*(.+)/i,
  /(?:תשלום\s+עד|לתשלום\s+עד)\s*[:\-]?\s*(.+)/i,
];


// ─────────────────────────────────────────────────────────────────────────────
// General patterns
// These are language-independent / shared patterns.
// ─────────────────────────────────────────────────────────────────────────────
const MONEY_PREFIX = '(?:US\\$|USD|[$€£₪])?\\s*';

const GROSS_LABEL_PATTERNS = [
  // Amount Received: 328.88
  new RegExp(
    `(?:amount\\s+received|amount\\s+paid|amount\\s+payable)\\s*[:\\-]?\\s*${MONEY_PREFIX}([\\d,. ]+)`,
    'i'
  ),

  // Grand Total / Total Amount / Total Due
  new RegExp(
    `(?:grand\\s+)?total\\s+(?:amount\\s+)?(?:due|paid|payable)\\s*[:\\-]?\\s*${MONEY_PREFIX}([\\d,. ]+)`,
    'i'
  ),

  // Amount Due / Amount Total / Amount Paid
  new RegExp(
    `amount\\s+(?:due|total|paid|payable)\\s*[:\\-]?\\s*${MONEY_PREFIX}([\\d,. ]+)`,
    'i'
  ),

  // Total $14.99 / Total USD 14.99
  new RegExp(
    `\\btotal\\b\\s*[:\\-]?\\s*${MONEY_PREFIX}([\\d,. ]+)`,
    'i'
  ),

  // Hebrew
  new RegExp(
    `(?:סה"כ|סכום\\s+כולל|לתשלום|סה"כ\\s+לתשלום)\\s*[:\\-]?\\s*${MONEY_PREFIX}([\\d,. ]+)`,
    'i'
  ),

  // German / French / Spanish
  new RegExp(
    `(?:summe\\s+gesamt|montant\\s+total|importe\\s+total)\\s*[:\\-]?\\s*${MONEY_PREFIX}([\\d,. ]+)`,
    'i'
  ),
];

const NET_LABEL_PATTERNS = [
  /(?:subtotal|sub[\s-]?total|net(?:\s+amount)?|before\s+tax)\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
];

const VAT_AMOUNT_LABEL_PATTERNS = [
  // Tax (13%) 456.30
  /(?:vat|tax|gst|hst|pst|tva|mwst|iva|מע"מ|מס\s+ערך\s+מוסף)\s*\(?\s*[\d.]+\s*%\s*\)?\s*[$€£₪]?\s*([\d,. ]+)/i,

  // VAT amount: 456.30
  /(?:vat|gst|hst|pst|tva|mwst|iva|מע"מ)\s+(?:amount)\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,

  // Tax: 456.30
  /(?:tax|מס\s+ערך\s+מוסף)\s*[:\-]\s*[$€£₪]?\s*([\d,. ]+)/i,
];

const VAT_RATE_PATTERNS = [
  // Tax (13%)
  /(?:vat|tax|gst|hst|pst|tva|mwst|iva|מע"מ|מס)\s*\(?\s*([\d.]+)\s*%\s*\)?/i,

  // 13% Tax
  /([\d.]+)\s*%\s*(?:vat|tax|gst|hst|pst|tva|mwst|iva|מע"מ|מס)/i,
];


// ─────────────────────────────────────────────────────────────────────────────
// English patterns
// ─────────────────────────────────────────────────────────────────────────────

const GROSS_LABEL_PATTERNS_EN = [
  /\bgrand\s+total\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\btotal\s+amount\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bamount\s+due\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bamount\s+payable\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\btotal\s+paid\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /(?:^|\s)total\s*[:\-]\s*[$€£₪]?\s*([\d,. ]+)/i,
  /(?:^|\s)total\s+[$€£₪]?\s*([\d,. ]+)/i,
];

const NET_LABEL_PATTERNS_EN = [
  /\bnet\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bnet\s+amount\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bsubtotal\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bsub[\s-]total\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bamount\s+before\s+tax\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bbefore\s+tax\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
];

const VAT_AMOUNT_LABEL_PATTERNS_EN = [
  /\bvat\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bvat\s+amount\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\bsales\s+tax\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\btax\s+amount\b\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,
  /\btax\b\s*[:\-]\s*[$€£₪]?\s*([\d,. ]+)/i,
];

const VAT_RATE_PATTERNS_EN = [
  /\bvat\b\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /\bvat\s+rate\b\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /\btax\b\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /\bsales\s+tax\b\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /(\d+(?:[.,]\d+)?)\s*%\s*vat\b/i,
];


// ─────────────────────────────────────────────────────────────────────────────
// Swedish patterns
// ─────────────────────────────────────────────────────────────────────────────

const GROSS_LABEL_PATTERNS_SV = [
  // Existing Swedish patterns
  /\btotal\s+pris\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  /\batt\s+betala\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  /\btotalt\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  /\bsumma\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  /\btotalsumma\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  // Amount before Swedish currency
  /\btotalt\b.*?([\d.,]+)\s*(?:kr|sek)\b/i,

  // "Totalt sex 39,00 kr"
  /\btotalt\s+\w+(?:\s+\w+)?\s+([\d.,]+)\s*(?:kr|sek)\b/i,

  // ------------------------------------------------------------
  // Generic currency amount fallback
  // ------------------------------------------------------------

  // Currency BEFORE amount:
  // £100
  // €100
  // € 100
  // SEK 100
  // EUR 100
  /(?:£|€|\$|kr|sek|eur|gbp|usd)\s*([\d]+(?:[.,]\d{1,2})?)/i,

  // Amount BEFORE currency:
  // 100 £
  // 100 €
  // 100 kr
  // 100 SEK
  /([\d]+(?:[.,]\d{1,2})?)\s*(?:£|€|\$|kr|sek|eur|gbp|usd)\b/i,

  // Label + currency + amount:
  // "Subtotal £100"
  // "Total €1836"
  // "Amount SEK 1836"
  /(?:subtotal|total|totalt|summa|amount|belopp)\b.*?(?:£|€|\$|kr|sek|eur|gbp|usd)\s*([\d]+(?:[.,]\d{1,2})?)/i,

  // Label + amount + currency:
  // "Subtotal 100 £"
  // "Totalt 39,00 kr"
  /(?:subtotal|total|totalt|summa|amount|belopp)\b.*?([\d]+(?:[.,]\d{1,2})?)\s*(?:£|€|\$|kr|sek|eur|gbp|usd)\b/i,
];

const NET_LABEL_PATTERNS_SV = [
  // Netto: 220,52
  /\bnetto\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  // Netto belopp: 220,52
  /\bnetto\s+belopp\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  // Belopp exkl moms: 220,52
  /\bbelopp\s+exkl\.?\s+moms\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  // Summa exkl moms: 220,52
  /\bsumma\s+exkl\.?\s+moms\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,
];

const VAT_AMOUNT_LABEL_PATTERNS_SV = [
  // VARAV MOMS 55,13
  /\bvarav\s+moms\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  // Moms: 55,13
  /\bmoms\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,

  // Momsbelopp: 55,13
  /\bmomsbelopp\b\s*[:\-]?\s*[kr€$£]?\s*([\d,. ]+)/i,
];

const VAT_RATE_PATTERNS_SV = [
  // Moms 25%
  /\bmoms\b\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,

  // Momssats 25%
  /\bmomssats\b\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,

  // 25% moms
  /(\d+(?:[.,]\d+)?)\s*%\s*moms\b/i,

  // VAT table: 12% 318.00 283.93 34.07
  /(\d+(?:[.,]\d+)?)\s*%/i,
];


// ─────────────────────────────────────────────────────────────────────────────
// Hebrew patterns
// ─────────────────────────────────────────────────────────────────────────────

const GROSS_LABEL_PATTERNS_HE = [
  /(?:סה["״']?כ\s+לתשלום)\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /(?:סכום\s+כולל)\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /(?:לתשלום)\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /(?:סה["״']?כ)\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /(?:סכום\s+לתשלום)\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /(?:סהכ\s+לתשלום)\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
];

const NET_LABEL_PATTERNS_HE = [
  /לפני\s+מע["״']?מ\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /ללא\s+מע["״']?מ\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /סכום\s+לפני\s+מע["״']?מ\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /סה["״']?כ\s+לפני\s+מע["״']?מ\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
];

const VAT_AMOUNT_LABEL_PATTERNS_HE = [
  /מע["״']?מ\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /סכום\s+מע["״']?מ\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /מעמ\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
  /מס\s+ערך\s+מוסף\s*[:\-]?\s*₪?\s*([\d,. ]+)/i,
];

const VAT_RATE_PATTERNS_HE = [
  /מע["״']?מ\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /מעמ\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /שיעור\s+מע["״']?מ\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /(\d+(?:[.,]\d+)?)\s*%\s*מע["״']?מ/i,
];


// ─────────────────────────────────────────────────────────────────────────────
// German patterns
// ─────────────────────────────────────────────────────────────────────────────

const GROSS_LABEL_PATTERNS_DE = [
  /(?:gesamtbetrag|gesamt\s+betrag|rechnungsbetrag|endbetrag)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
  /(?:zu\s+zahlen|zahlbetrag)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
  /(?:gesamtsumme|summe)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
];

const NET_LABEL_PATTERNS_DE = [
  /(?:nettobetrag|netto)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
  /(?:zwischensumme|zwischen\s+summe)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
];

const VAT_AMOUNT_LABEL_PATTERNS_DE = [
  /(?:mwst|mwst\.|mehrwertsteuer|umsatzsteuer)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
  /(?:mwstbetrag|steuerbetrag)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
];

const VAT_RATE_PATTERNS_DE = [
  /(?:mwst|mwst\.|mehrwertsteuer|umsatzsteuer)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /(\d+(?:[.,]\d+)?)\s*%\s*(?:mwst|mwst\.|mehrwertsteuer|umsatzsteuer)/i,
];


// ─────────────────────────────────────────────────────────────────────────────
// French patterns
// ─────────────────────────────────────────────────────────────────────────────

const GROSS_LABEL_PATTERNS_FR = [
  /(?:total\s+ttc|montant\s+total|total\s+à\s+payer|net\s+à\s+payer)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
  /(?:total)\s*[:\-]\s*[€$£]?\s*([\d., ]+)/i,
];

const NET_LABEL_PATTERNS_FR = [
  /(?:sous-total|sous\s+total|total\s+ht|montant\s+ht)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
];

const VAT_AMOUNT_LABEL_PATTERNS_FR = [
  /(?:tva|montant\s+tva|taxe)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
];

const VAT_RATE_PATTERNS_FR = [
  /(?:tva|taux\s+de\s+tva)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /(\d+(?:[.,]\d+)?)\s*%\s*(?:tva)/i,
];


// ─────────────────────────────────────────────────────────────────────────────
// Spanish patterns
// ─────────────────────────────────────────────────────────────────────────────

const GROSS_LABEL_PATTERNS_ES = [
  /(?:importe\s+total|total\s+a\s+pagar|total\s+factura|total)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
];

const NET_LABEL_PATTERNS_ES = [
  /(?:subtotal|base\s+imponible|importe\s+neto)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
];

const VAT_AMOUNT_LABEL_PATTERNS_ES = [
  /(?:iva|importe\s+iva|impuesto)\s*[:\-]?\s*[€$£]?\s*([\d., ]+)/i,
];

const VAT_RATE_PATTERNS_ES = [
  /(?:iva|tipo\s+iva)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /(\d+(?:[.,]\d+)?)\s*%\s*iva/i,
];


// ─────────────────────────────────────────────────────────────────────────────
// Final language map
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_PATTERNS = {
  eng: {
    gross: GROSS_LABEL_PATTERNS_EN,
    net: NET_LABEL_PATTERNS_EN,
    vatAmount: VAT_AMOUNT_LABEL_PATTERNS_EN,
    vatRate: VAT_RATE_PATTERNS_EN,
  },

  swe: {
    gross: GROSS_LABEL_PATTERNS_SV,
    net: NET_LABEL_PATTERNS_SV,
    vatAmount: VAT_AMOUNT_LABEL_PATTERNS_SV,
    vatRate: VAT_RATE_PATTERNS_SV,
  },

  heb: {
    gross: GROSS_LABEL_PATTERNS_HE,
    net: NET_LABEL_PATTERNS_HE,
    vatAmount: VAT_AMOUNT_LABEL_PATTERNS_HE,
    vatRate: VAT_RATE_PATTERNS_HE,
  },

  deu: {
    gross: [
      ...GROSS_LABEL_PATTERNS,
      ...GROSS_LABEL_PATTERNS_DE,
    ],
    net: [
      ...NET_LABEL_PATTERNS,
      ...NET_LABEL_PATTERNS_DE,
    ],
    vatAmount: [
      ...VAT_AMOUNT_LABEL_PATTERNS,
      ...VAT_AMOUNT_LABEL_PATTERNS_DE,
    ],
    vatRate: [
      ...VAT_RATE_PATTERNS,
      ...VAT_RATE_PATTERNS_DE,
    ],
  },

  fra: {
    gross: [
      ...GROSS_LABEL_PATTERNS,
      ...GROSS_LABEL_PATTERNS_FR,
    ],
    net: [
      ...NET_LABEL_PATTERNS,
      ...NET_LABEL_PATTERNS_FR,
    ],
    vatAmount: [
      ...VAT_AMOUNT_LABEL_PATTERNS,
      ...VAT_AMOUNT_LABEL_PATTERNS_FR,
    ],
    vatRate: [
      ...VAT_RATE_PATTERNS,
      ...VAT_RATE_PATTERNS_FR,
    ],
  },

  spa: {
    gross: [
      ...GROSS_LABEL_PATTERNS,
      ...GROSS_LABEL_PATTERNS_ES,
    ],
    net: [
      ...NET_LABEL_PATTERNS,
      ...NET_LABEL_PATTERNS_ES,
    ],
    vatAmount: [
      ...VAT_AMOUNT_LABEL_PATTERNS,
      ...VAT_AMOUNT_LABEL_PATTERNS_ES,
    ],
    vatRate: [
      ...VAT_RATE_PATTERNS,
      ...VAT_RATE_PATTERNS_ES,
    ],
  },
};

const CURRENCY_DETECTORS = [
  {
    code: 'SEK',
    patterns: [
      /\bSEK\b/i,
      /\bkr\b/i,
      /\bsvenska\s+kronor\b/i,
    ],
  },

  {
    code: 'ILS',
    patterns: [
      /\bILS\b/i,
      /\bNIS\b/i,
      /₪/,
      /\bש["׳']?ח\b/i,
    ],
  },

  {
    code: 'EUR',
    patterns: [
      /\bEUR\b/i,
      /€/,
      /\beuro\b/i,
    ],
  },

  {
    code: 'USD',
    patterns: [
      /\bUSD\b/i,
      /\$/i,
      /\bdollar\b/i,
    ],
  },

  {
    code: 'GBP',
    patterns: [
      /\bGBP\b/i,
      /£/,
      /\bpound\b/i,
    ],
  },
];

const COUNTRY_DEFAULT_CURRENCIES = {
  SE: 'SEK',
  IL: 'ILS',
  US: 'USD',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
};

// Lines whose content should never be used as a vendor name
const VENDOR_SKIP =
  /^(invoice|receipt|payment\s+receipt|payment|tax\s+invoice|bill|statement|date|payment\s+date|total|amount|page|ref|no\.?|billing\s+id|invoice\s+id|customer\s+id|paid\s+with|first\s+card|description|חשבונית|קבלה|מסמך)/i;

const PAYMENT_KEYWORDS =
  /\b(?:paid|payment|paid with|amount paid|total paid|grand total|amount due|att betala|betalt|kort)\b/i;

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidDocumentNumber(value) {
  if (!value) return false;

  const v = String(value).trim();

  // Too short
  if (v.length < 4) return false;

  // Reject obvious English words
  if (/^[A-Za-z]+$/i.test(v)) return false;

  // Must contain at least one digit
  if (!/\d/.test(v)) return false;

  // Reject common OCR garbage
  const rejected = new Set([
    'money',
    'order',
    'slip',
    'invoice',
    'receipt',
    'number',
    'num',
    'oice',
    'voice',
    'total',
    'amount',
  ]);

  if (rejected.has(v.toLowerCase())) return false;

  return true;
}

function looksLikeDocumentNumber(value) {
  if (!value) return false;

  const text = value.trim();

  // 04846-28711740
  if (/^\d{3,8}-\d{4,20}$/.test(text)) {
    return true;
  }

  // INV-12345, 0432, etc.
  if (/^[A-Z0-9][A-Z0-9\-\/]{3,30}$/i.test(text)) {
    return /\d/.test(text);
  }

  return false;
}

function makeField(value, status, sourceText = '', method = 'keyword', page = 1) {
  return { value, status, sourceText, method, page };
}

function missing() {
  return { value: null, status: 'missing', sourceText: '', method: 'none', page: null };
}

/** Parse a date string into ISO YYYY-MM-DD. Returns null if not parseable. */
function parseDate(raw) {
  if (!raw) return null;

  const s = String(raw).trim();

  // Helper: return YYYY-MM-DD WITHOUT timezone conversion.
  function formatLocalDate(year, month, day) {
    return (
      `${String(year).padStart(4, '0')}-` +
      `${String(month).padStart(2, '0')}-` +
      `${String(day).padStart(2, '0')}`
    );
  }

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  let m = s.match(
    /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/
  );

  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    console.log('[parseDate] YYYY-MM-DD match:', {
      raw: s,
      year,
      month,
      day
    });

    const d = new Date(year, month - 1, day);

    if (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    ) {
      return formatLocalDate(year, month, day);
    }

    return null;
  }

  // DD/MM/YYYY / DD-MM-YYYY / DD.MM.YYYY
  m = s.match(
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/
  );

  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);

    const d = new Date(year, month - 1, day);

    if (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    ) {
      return formatLocalDate(year, month, day);
    }

    return null;
  }

  // DD/MM/YY
  m = s.match(
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/
  );

  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);

    const shortYear = Number(m[3]);

    const year =
      shortYear < 70
        ? 2000 + shortYear
        : 1900 + shortYear;

    const d = new Date(year, month - 1, day);

    if (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    ) {
      return formatLocalDate(year, month, day);
    }

    return null;
  }

  // April 15, 2026
  // Apr 15, 2026
  m = s.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(\d{4})\b/i
  );

  if (m) {
    const months = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12,
    };

    const month = months[m[1].toLowerCase()];
    const day = Number(m[2]);
    const year = Number(m[3]);

    console.log('[parseDate] Month-name match:', {
      raw: s,
      year,
      month,
      day
    });

    const d = new Date(year, month - 1, day);

    if (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    ) {
      return formatLocalDate(year, month, day);
    }

    return null;
  }

  // DD Month YYYY
  // Examples:
  // 15 April 2026
  // 15 Apr 2026
  // 15th April 2026
  m = s.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{4})\b/i
  );

  if (m) {
    const months = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };

    const day = Number(m[1]);
    const month = months[m[2].toLowerCase()];
    const year = Number(m[3]);

    if (month === undefined) return null;

    // IMPORTANT:
    // Don't create a Date object, because that can introduce
    // timezone-related day changes.
    const result =
      `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    console.log('[parseDate] DD Month YYYY match:', {
      raw: s,
      result,
      year,
      month: month + 1,
      day
    });

    return result;
  }

  return null;
}

/** Find first ISO date in a string fragment. */
function extractDateFromFragment(frag) {
  const text = String(frag).trim();
  const lower = text.toLowerCase();

  const candidates = [
    // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
    ...text.matchAll(
      /\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/g
    ),

    // DD/MM/YYYY / DD-MM-YYYY / DD.MM.YYYY
    ...text.matchAll(
      /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b/g
    ),

    // DD/MM/YY
    ...text.matchAll(
      /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2}\b/g
    ),

    // October 27, 2023 / oct 27, 2023
    ...lower.matchAll(
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)\d{4}\b/g
    ),

    // 27 October 2023 / 27 oct 2023
    ...lower.matchAll(
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[,\s]+\d{4}\b/g
    ),
  ];

  for (const m of candidates) {
    const d = parseDate(m[0]);
    if (d) return d;
  }

  // Fallback: let parseDate try the entire fragment.
  const direct = parseDate(text);
  if (direct) return direct;

  return null;
}

/** Parse a monetary amount string to a positive float or null. */
function parseAmount(raw) {
  if (raw == null) return null;

  let s = String(raw)
    .trim()
    .replace(/[^\d,.\-]/g, '');

  if (!s) return null;

  // Both comma and dot exist:
  // 1.234,56 -> 1234.56
  // 1,234.56 -> 1234.56
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  // Only comma:
  // 275,65 -> 275.65
  else if (s.includes(',')) {
    const parts = s.split(',');

    if (parts.length === 2 && parts[1].length === 2) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  // Only dot = normal decimal
  const value = Number(s);

  return Number.isFinite(value) ? value : null;
}

/** Find amounts (>0) in a line; returns the last match (totals are usually rightmost). */
function findAmountInLine(line) {
  const patterns = [
    /[\d]{1,3}(?:[,. ]?\d{3})*[,.]\d{2}/g,
    /[\d]+[,.]\d{2}/g,
  ];
  let best = null;
  for (const p of patterns) {
    const matches = [...line.matchAll(p)];
    if (matches.length > 0) {
      const raw = matches[matches.length - 1][0];
      const v = parseAmount(raw);
      if (v !== null && v > 0) best = { value: v, raw };
    }
    if (best) break;
  }
  return best;
}

function detectCurrency(text) {
  if (!text) return null;

  // ============================================================
  // 1. Check explicit currencies FIRST.
  //    This prevents generic "kr" from winning over € / £ / $
  // ============================================================

  const explicitCurrencyCodes = [
    'EUR',
    'GBP',
    'USD',
    'ILS',
    'SEK',
  ];

  for (const code of explicitCurrencyCodes) {
    const detector = CURRENCY_DETECTORS.find(
      (d) => d.code === code
    );

    if (!detector) continue;

    // For SEK, skip the generic "kr" pattern here.
    // It will be checked only as a fallback below.
    const patterns =
      code === 'SEK'
        ? detector.patterns.filter(
          (p) => p.toString() !== '/\\bkr\\b/i'
        )
        : detector.patterns;

    if (patterns.some((p) => p.test(text))) {
      return code;
    }
  }

  // ============================================================
  // 2. "kr" is ambiguous, so use it only as a fallback.
  // ============================================================

  const sekDetector = CURRENCY_DETECTORS.find(
    (d) => d.code === 'SEK'
  );

  if (
    sekDetector &&
    sekDetector.patterns.some((p) => p.test(text))
  ) {
    return 'SEK';
  }

  return null;
}

// ── Parser entry ──────────────────────────────────────────────────────────────

/**
 * Parse extracted text into structured receipt/invoice fields.
 *
 * @param {string} fullText - joined text from all pages
 * @param {{ pageNum:number, text:string, items:object[] }[]} pages
 * @returns {{ fields: object, validationIssues: object[] }}
 */
export async function parseReceipt(fullText, language, pages = []) {
  const lines = fullText
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const fields = {};

  // Normalize language.
  // OCR may return something slightly different depending on the OCR library.
  const normalizedLanguage =
    language === 'swe' ||
      language === 'sv' ||
      language === 'swe+eng'
      ? 'swe'
      : language === 'heb' ||
        language === 'he'
        ? 'heb'
        : language === 'deu' ||
          language === 'de'
          ? 'deu'
          : language === 'fra' ||
            language === 'fr'
            ? 'fra'
            : language === 'spa' ||
              language === 'es'
              ? 'spa'
              : 'eng';

  let languagePatterns =
    LANGUAGE_PATTERNS[normalizedLanguage] ||
    LANGUAGE_PATTERNS.eng;

  let grossPatterns = languagePatterns.gross;
  let netPatterns = languagePatterns.net;
  let vatAmountPatterns = languagePatterns.vatAmount;
  let vatRatePatterns = languagePatterns.vatRate;

  // ============================================================================
  // Document type
  // ============================================================================

  let docType = null;
  let docTypeLine = '';

  for (const [type, pattern] of Object.entries(DOCUMENT_TYPE_PATTERNS)) {
    const line = lines.find((l) => pattern.test(l));

    if (line) {
      docType = type;
      docTypeLine = line;
      break;
    }
  }

  fields.documentType = docType
    ? makeField(docType, 'found', docTypeLine, 'keyword')
    : makeField('receipt', 'review', '', 'default');

  // ============================================================================
  // Vendor name
  // ============================================================================

  let vendorName = null;
  let vendorLine = '';

  let bankDetected = false;

  const BANK_PATTERNS = [
    /\b(?:bank|banken|bankgiro|bankgirot)\b/i,
    /\b(?:בנק|בנקים|בנקאות)\b/i,
  ];

  // ============================================================================
  // 1. Explicit "Sold by" — highest priority
  // ============================================================================

  for (const line of lines) {
    const cleaned = line
      .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
      .trim();

    const soldByMatch = cleaned.match(
      /^sold\s+by\s*[:\-]?\s*(.+?)\s*$/i
    );

    if (soldByMatch) {
      const candidate = soldByMatch[1].trim();

      if (candidate.length >= 2) {
        vendorName = candidate;
        vendorLine = cleaned;

        console.log('[VENDOR] Found from Sold by:', {
          value: vendorName,
          line: cleaned
        });

        break;
      }
    }
  }

  // ============================================================================
  // 2. Explicit company name before Billing ID / Invoice ID
  // ============================================================================

  if (!vendorName) {
    for (const line of lines.slice(0, 15)) {
      const cleaned = line
        .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
        .trim();

      const companyMatch = cleaned.match(
        /^(.+?)\s+(?:billing\s+id|invoice\s+id|customer\s+id)\b/i
      );

      if (companyMatch) {
        const candidate = companyMatch[1].trim();

        if (candidate.length >= 3) {
          vendorName = candidate;
          vendorLine = cleaned;

          console.log('[VENDOR] Found before ID:', {
            value: vendorName,
            line: cleaned
          });

          break;
        }
      }
    }
  }

  // ============================================================================
  // 3. Account Name → vendor is the next line
  // ============================================================================
  console.log('[VENDOR DEBUG] First 15 lines:', lines.slice(0, 15));

  if (!vendorName) {
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const cleaned = lines[i]
        .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
        .trim();

      console.log('[VENDOR DEBUG] Checking:', JSON.stringify(cleaned));
      if (!/^account\s+name\s*:/i.test(cleaned)) {
        continue;
      }

      const nextLine = lines[i + 1]
        ?.replace(/[\u200E\u200F\u202A-\u202E]/g, '')
        .trim();

      if (!nextLine || nextLine.length < 2) {
        continue;
      }

      // Prefer an all-caps company name.
      if (
        /[A-Z]/.test(nextLine) &&
        !VENDOR_SKIP.test(nextLine) &&
        !/^[\d\s.,:/\\-]+$/.test(nextLine)
      ) {
        vendorName = nextLine;
        vendorLine = nextLine;

        console.log('[VENDOR] Found after Account Name:', {
          value: vendorName,
          line: nextLine
        });

        break;
      }
    }
  }

  // ============================================================================
  // 4. Email address / OCR email → use as vendor identifier
  // ============================================================================

  if (!vendorName) {
    for (const line of lines.slice(0, 15)) {
      const cleaned = line
        .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
        .trim();

      // Normal email
      const emailMatch = cleaned.match(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
      );

      if (emailMatch) {
        vendorName = emailMatch[0];
        vendorLine = cleaned;

        console.log('[VENDOR] Found email:', {
          value: vendorName,
          line: cleaned
        });

        break;
      }

      // ------------------------------------------------------------------------
      // OCR email:
      //
      // josephboyssmith@yahoo.co.uk
      //          ↓ OCR
      // josephboyssmitheyahoo.co.uk
      //
      // Find an "e" followed by a domain-like string.
      // ------------------------------------------------------------------------

      const possibleEmail = cleaned.match(
        /\b([A-Z0-9._%+-]+)e([A-Z0-9.-]+\.[A-Z]{2,})\b/i
      );

      if (possibleEmail) {
        const username = possibleEmail[1];
        const domain = possibleEmail[2];

        // Make sure both sides are meaningful.
        if (
          username.length >= 2 &&
          domain.length >= 4 &&
          /\.[A-Z]{2,}$/i.test(domain)
        ) {
          const correctedEmail =
            `${username}@${domain}`;

          vendorName = correctedEmail;
          vendorLine = cleaned;

          console.log('[VENDOR] Found OCR email:', {
            original: cleaned,
            corrected: correctedEmail
          });

          break;
        }
      }
    }
  }
  // ============================================================================
  // Organization / department name
  // ============================================================================

  if (!vendorName) {
    for (const line of lines.slice(0, 20)) {
      const cleaned = line
        .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
        .trim();

      if (!cleaned) continue;

      // Looks like an organization or department name.
      if (
        /\b(?:department|management|financial|finance|ministry|authority|agency|administration|university|municipality|council|government|company|limited|ltd|inc|corp|corporation)\b/i.test(cleaned)
      ) {
        vendorName = cleaned;
        vendorLine = cleaned;

        console.log('[VENDOR] Organization name found:', {
          value: vendorName,
          line: cleaned
        });

        break;
      }
    }
  }

  // ============================================================================
  // 5. Only if no explicit vendor was found: normal fallback
  // ============================================================================

  if (!vendorName) {
    for (const line of lines.slice(0, 15)) {

      const cleaned = line
        .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
        .trim();

      if (cleaned.length < 2) continue;

      if (VENDOR_SKIP.test(cleaned)) continue;

      if (
        normalizedLanguage !== 'heb' &&
        /[\u0590-\u05FF]/.test(cleaned)
      ) {
        continue;
      }

      if (/^[\d\/\-. \s]+$/.test(cleaned)) continue;

      if (/^[#*\-=_|>]+$/.test(cleaned)) continue;

      if (/^[A-Z]{1,3}\s*[-=_|]+$/i.test(cleaned)) continue;

      if (/^#?\d{3,8}-\d{4,20}$/.test(cleaned)) continue;

      const amtHit = findAmountInLine(cleaned);

      if (amtHit && cleaned.length < 25) continue;

      if (
        /^(?:date|payment\s+date|amount|total|subtotal|tax|sales tax|vat|currency)\s*[:|]/i.test(cleaned)
      ) {
        continue;
      }

      vendorName = cleaned;
      vendorLine = cleaned;

      console.log('[VENDOR] Fallback:', {
        value: vendorName,
        line: cleaned
      });

      break;
    }
  }

  fields.vendorName = vendorName
    ? makeField(
      vendorName,
      'review',
      vendorLine,
      'vendor_detection'
    )
    : missing();
  // ============================================================================
  // Document number
  // ============================================================================

  let docNumber = null;
  let docNumberLine = '';

  outer: for (const pattern of INVOICE_NUMBER_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);

      if (!m || !m[1]) continue;

      const candidate = m[1].trim();

      if (!isValidDocumentNumber(candidate)) {
        continue;
      }

      docNumber = candidate;
      docNumberLine = line;
      break outer;
    }
  }

  fields.documentNumber = docNumber
    ? makeField(
      docNumber,
      'found',
      docNumberLine,
      'pattern'
    )
    : missing();

  // ============================================================================
  // Document date
  // ============================================================================

  let docDate = null;
  let docDateLine = '';

  outer2: for (const pattern of DATE_LABEL_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);

      if (m) {
        const d = extractDateFromFragment(m[1] ?? m[0]);

        if (d) {
          docDate = d;
          docDateLine = line;
          break outer2;
        }
      }
    }
  }

  if (!docDate) {
    for (const line of lines.slice(0, 20)) {
      const d = extractDateFromFragment(line);

      if (d) {
        docDate = d;
        docDateLine = line;
        break;
      }
    }
  }

  fields.documentDate = docDate
    ? makeField(docDate, 'found', docDateLine, 'pattern')
    : missing();

  // ============================================================================
  // Due date
  // ============================================================================

  let dueDate = null;
  let dueDateLine = '';

  outer3: for (const pattern of DUE_DATE_LABEL_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);

      if (m) {
        const d = extractDateFromFragment(m[1] ?? m[0]);

        if (d && d !== docDate) {
          dueDate = d;
          dueDateLine = line;
          break outer3;
        }
      }
    }
  }

  fields.dueDate = dueDate
    ? makeField(dueDate, 'found', dueDateLine, 'pattern')
    : missing();

  // ============================================================================
  // VAT rate
  // ============================================================================

  let vatRate = null;
  let vatRateLine = '';
  let vatRateMethod = 'pattern';

  // --------------------------------------------------------------------------
  // 1. Try language-specific VAT rate patterns
  // --------------------------------------------------------------------------

  outer4: for (const pattern of vatRatePatterns) {
    for (const line of lines) {
      const m = line.match(pattern);

      if (m) {
        const r = parseFloat(
          String(m[1]).replace(',', '.')
        );

        if (!isNaN(r) && r >= 0 && r <= 100) {
          vatRate = r;
          vatRateLine = line;
          vatRateMethod = 'pattern';
          break outer4;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. VAT table fallback
  //
  // Example OCR:
  //   | 12% 318.00 283.93 34.07
  //
  // Format:
  //   VAT rate | Gross | Net | VAT
  // --------------------------------------------------------------------------

  if (vatRate === null) {
    for (const line of lines) {
      const m = line.match(
        /(?:^|\s)(\d{1,2}(?:[.,]\d+)?)%\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/
      );

      if (!m) continue;

      const r = parseFloat(
        String(m[1]).replace(',', '.')
      );

      if (!isNaN(r) && r >= 0 && r <= 100) {
        vatRate = r;
        vatRateLine = line;
        vatRateMethod = 'vat_table';
        break;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. Final VAT rate field
  // --------------------------------------------------------------------------

  fields.vatRate =
    vatRate !== null
      ? makeField(
        vatRate,
        vatRateMethod === 'country_default'
          ? 'review'
          : 'found',
        vatRateLine,
        vatRateMethod
      )
      : missing();

  // ============================================================================
  // Country detection
  // ============================================================================

  let countryDetected = detectCountry(fullText);

  const isPlaceholder = (value) => {
    if (!value) return true;

    const normalized = String(value)
      .trim()
      .toLowerCase();

    return [
      'address',
      '[address]',
      '(address)',
      'city',
      '[city]',
      '(city)',
      'street',
      '[street]',
      '(street)',
      'name',
      '[name]',
      '(name)',
      'company',
      '[company]',
      '(company)',
    ].includes(normalized);
  };

  // Try city geocoding if country was not detected.
  if (!countryDetected) {
    const city = extractCity(fullText);

    if (city && !isPlaceholder(city)) {
      const geoResult = await geocode(city);

      if (geoResult?.countryCode) {
        countryDetected = {
          code: geoResult.countryCode,
          name: geoResult.country,
          confidence: 'low',
          reason: `Country determined from city "${city}"`,
          method: 'city_geocoding',
        };
      }
    }
  }

  // Try address geocoding if country was still not detected.
  if (!countryDetected) {
    const address = extractAddress(fullText);

    if (address && !isPlaceholder(address)) {
      const geoResult = await geocode(address);

      if (geoResult?.countryCode) {
        countryDetected = {
          code: geoResult.countryCode,
          name: geoResult.country,
          confidence: 'low',
          reason: `Country determined from address "${address}"`,
          method: 'address_geocoding',
        };
      }
    }
  }

  // ============================================================================
  // Save country + VAT fallback
  // ============================================================================

  if (countryDetected) {
    fields.country = {
      value: countryDetected.code,
      countryName: countryDetected.name,
      confidence: countryDetected.confidence,

      status:
        countryDetected.confidence === 'low'
          ? 'review'
          : 'found',

      sourceText: countryDetected.reason,
      method: countryDetected.method ?? 'country_detection',
      page: null,
    };

    // Only use country's VAT rate when:
    // 1. No explicit VAT rate was found.
    // 2. Country confidence is high or medium.
    if (
      vatRate === null &&
      ['high', 'medium'].includes(countryDetected.confidence)
    ) {
      const countryVat = getCountryVatRate(
        countryDetected.code
      );

      if (countryVat !== null) {
        vatRate = countryVat;
        vatRateLine =
          `Standard rate for ${countryDetected.name}: ${countryVat}%`;
        vatRateMethod = 'country_default';

        fields.vatRate = makeField(
          vatRate,
          'review',
          vatRateLine,
          vatRateMethod
        );
      }
    }
  } else {
    fields.country = {
      value: null,
      countryName: null,
      confidence: null,
      status: 'missing',
      sourceText: '',
      method: 'none',
      page: null,
    };
  }

  // ============================================================================
  // Currency
  // ============================================================================

  const currency = detectCurrency(fullText);

  if (currency) {
    fields.currency = makeField(
      currency,
      'found',
      '',
      'detector'
    );
  } else if (
    language === 'swe' ||
    fields.country?.value === 'SE'
  ) {
    fields.currency = makeField(
      'SEK',
      'review',
      'Currency inferred from Swedish document',
      'country'
    );
  } else {
    fields.currency = makeField(
      'ILS',
      'review',
      '',
      'default'
    );
  }

  // ============================================================================
  // Re-select financial patterns after country/currency detection
  // ============================================================================

  let financialLanguage = normalizedLanguage;

  if (
    fields.country?.value === 'SE' ||
    currency === 'SEK'
  ) {
    financialLanguage = 'swe';
  } else if (
    fields.country?.value === 'IL' ||
    currency === 'ILS'
  ) {
    financialLanguage = 'heb';
  }

  const detectedLanguagePatterns =
    LANGUAGE_PATTERNS[financialLanguage] ||
    LANGUAGE_PATTERNS.eng;

  // Replace the initial language-based patterns with the
  // country/currency-aware patterns for monetary extraction.
  grossPatterns = detectedLanguagePatterns.gross;
  netPatterns = detectedLanguagePatterns.net;
  vatAmountPatterns = detectedLanguagePatterns.vatAmount;

  // VAT rate is NOT replaced here because it was already checked above.
  // If you want Swedish country-based VAT patterns too, handle those
  // separately before the VAT fallback.

  console.log('[FINANCIAL PATTERNS]', {
    normalizedLanguage,
    country: fields.country?.value,
    detectedCurrency: currency,
    financialLanguage,
    grossPatterns: grossPatterns.map(p => p.toString()),
    netPatterns: netPatterns.map(p => p.toString()),
    vatAmountPatterns: vatAmountPatterns.map(p => p.toString())
  });

  /// ============================================================================
  // Gross amount
  // ============================================================================

  let grossAmount = null;
  let grossAmountLine = '';

  // 1. Normal gross patterns
  outer5: for (const pattern of grossPatterns) {
    for (const line of lines) {
      // console.log('[GROSS CHECK]', {
      //   line,
      //   pattern: pattern.toString()
      // });

      const m = line.match(pattern);

      if (!m || !m[1]) continue;

      const v = parseAmount(m[1]);

      if (v !== null && v > 0) {
        grossAmount = v;
        grossAmountLine = line;
        break outer5;
      }
    }
  }

  // ============================================================================
  // Currency directly followed by amount
  //
  // Examples:
  // EUR 100
  // USD 50.00
  // SEK 1836
  // GBP 25,50
  // ILS 100
  // €100
  // £100
  // $100
  // ₪100
  // ============================================================================

  if (grossAmount === null) {
    const CURRENCY_AMOUNT_PATTERNS = [
      // ‘Amount: EUR 850.00
      /.*?(?:amount|total|grand\s+total|amount\s+due)\s*:\s*(?:EUR|USD|SEK|GBP|ILS|NIS)\s*([0-9][0-9.,\s]*)/i,

      // Amount EUR 850.00 (without colon)
      /.*?(?:amount|total|grand\s+total|amount\s+due)\s+(?:EUR|USD|SEK|GBP|ILS|NIS)\s*([0-9][0-9.,\s]*)/i,

      // EUR 850.00
      /\b(?:EUR|USD|SEK|GBP|ILS|NIS)\b\s*([0-9][0-9.,\s]*)/i,

      // €850.00 / £850.00 / $850.00 / ₪850.00
      /[€£$₪]\s*([0-9][0-9.,\s]*)/i,
    ];

    outerCurrencyAmount:
    for (const pattern of CURRENCY_AMOUNT_PATTERNS) {
      for (const line of lines) {
        const m = line.match(pattern);

        console.log('[GROSS CURRENCY CHECK]', {
          line,
          pattern: pattern.toString(),
          match: m?.[0] ?? null,
          amount: m?.[1] ?? null
        });

        if (!m || !m[1]) continue;

        const v = parseAmount(m[1]);

        if (v !== null && v > 0) {
          grossAmount = v;
          grossAmountLine = line;

          console.log('[GROSS] Found currency + amount:', {
            value: grossAmount,
            line: grossAmountLine
          });

          break outerCurrencyAmount;
        }
      }
    }
  }

  // 2. Your existing strongGrossPatterns fallback
  if (grossAmount === null) {
    // ... your existing strongGrossPatterns code ...
  }

  // 3. LAST RESORT: exactly one payment amount
  if (grossAmount === null) {
    const paymentAmounts = [];

    const PAYMENT_KEYWORDS =
      /\b(?:paid|payment|amount paid|total paid|grand total|amount due|att betala|betalt|kort)\b/i;

    for (const line of lines) {
      if (!PAYMENT_KEYWORDS.test(line)) continue;

      const amounts = line.match(/\d+(?:[.,]\d{2})/g);

      if (!amounts) continue;

      for (const raw of amounts) {
        const value = parseAmount(raw);

        if (value !== null && value > 0) {
          paymentAmounts.push({
            value,
            line,
          });
        }
      }
    }

    // Only one payment amount found → use it as final total
    if (paymentAmounts.length === 1) {
      grossAmount = paymentAmounts[0].value;
      grossAmountLine = paymentAmounts[0].line;
    }
  }

  // 4. Create the field
  fields.grossAmount =
    grossAmount !== null
      ? makeField(
        grossAmount,
        'found',
        grossAmountLine,
        'keyword'
      )
      : makeField(
        null,
        'found',
        'Gross amount detected but value could not be read',
        'unreadable_amount'
      );

  // ============================================================================
  // Net amount
  // ============================================================================

  let netAmount = null;
  let netAmountLine = '';

  outer6: for (const pattern of netPatterns) {
    for (const line of lines) {
      const m = line.match(pattern);

      if (!m || !m[1]) continue;

      const v = parseAmount(m[1]);

      if (v !== null && v > 0) {
        netAmount = v;
        netAmountLine = line;
        break outer6;
      }
    }
  }

  if (netAmount === null && normalizedLanguage === 'swe') {
    for (const line of lines) {
      const m = line.match(
        /(\d+(?:[.,]\d+)?)\s*%\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/
      );

      if (!m) continue;

      const total = parseAmount(m[2]);
      const net = parseAmount(m[3]);
      const vat = parseAmount(m[4]);

      if (
        total !== null &&
        net !== null &&
        vat !== null &&
        Math.abs((net + vat) - total) < 0.1
      ) {
        netAmount = net;
        netAmountLine = line;
        break;
      }
    }
  }

  fields.netAmount =
    netAmount !== null
      ? makeField(
        netAmount,
        'found',
        netAmountLine,
        'keyword'
      )
      : missing();

  // ============================================================================
  // VAT amount
  // ============================================================================

  let vatAmount = null;
  let vatAmountLine = '';

  outer7: for (const pattern of vatAmountPatterns) {
    for (const line of lines) {
      const m = line.match(pattern);

      if (!m || !m[1]) continue;

      const v = parseAmount(m[1]);

      if (v !== null && v > 0) {
        vatAmount = v;
        vatAmountLine = line;
        break outer7;
      }
    }
  }

  fields.vatAmount =
    vatAmount !== null
      ? makeField(
        vatAmount,
        'found',
        vatAmountLine,
        'keyword'
      )
      : missing();

  // ============================================================================
  // Arithmetic derivation
  // ============================================================================

  // 1. gross + vatAmount → net
  if (
    grossAmount !== null &&
    vatAmount !== null &&
    netAmount === null
  ) {
    const derived =
      Math.round((grossAmount - vatAmount) * 100) / 100;

    if (derived > 0) {
      fields.netAmount = makeField(
        derived,
        'review',
        'derived: gross − vat',
        'arithmetic'
      );

      netAmount = derived;
    }
  }

  // 2. gross + net → vatAmount
  if (
    grossAmount !== null &&
    netAmount !== null &&
    vatAmount === null
  ) {
    const derived =
      Math.round((grossAmount - netAmount) * 100) / 100;

    if (derived >= 0) {
      fields.vatAmount = makeField(
        derived,
        'review',
        'derived: gross − net',
        'arithmetic'
      );

      vatAmount = derived;
    }
  }

  // 3. net + vatAmount → gross
  if (
    netAmount !== null &&
    vatAmount !== null &&
    grossAmount === null
  ) {
    const derived =
      Math.round((netAmount + vatAmount) * 100) / 100;

    fields.grossAmount = makeField(
      derived,
      'review',
      'derived: net + vat',
      'arithmetic'
    );

    grossAmount = derived;
  }

  // 4. gross + vatRate → derive net + VAT
  // 4. gross + vatRate → derive net + VAT
  if (
    grossAmount !== null &&
    vatRate !== null &&
    netAmount === null &&
    vatAmount === null
  ) {
    const rate = vatRate / 100;

    const derivedNet =
      Math.round(
        (grossAmount / (1 + rate)) * 100
      ) / 100;

    const derivedVat =
      Math.round(
        (grossAmount - derivedNet) * 100
      ) / 100;

    if (derivedNet > 0) {
      fields.netAmount = makeField(
        derivedNet,
        'review',
        `derived: ${grossAmount} / (1 + ${vatRate}%)`,
        'arithmetic'
      );

      fields.vatAmount = makeField(
        derivedVat,
        'review',
        `derived: ${grossAmount} − ${derivedNet}`,
        'arithmetic'
      );

      netAmount = derivedNet;
      vatAmount = derivedVat;
    }
  }

  // ========================================================================
  // Money detection check
  // ========================================================================

  const moneyNeedsReview =
    grossAmount === null &&
    netAmount === null &&
    vatAmount === null;

  if (moneyNeedsReview) {
    console.warn(
      '[Parser] No monetary amounts found — manual check required'
    );
  }

  // ============================================================================
  // Financial validation
  // ============================================================================

  const validationIssues = [];

  const TOL = (v) =>
    Math.max(0.05, Math.abs(v) * 0.005);

  // Validate:
  // net + VAT ≈ gross
  if (
    grossAmount !== null &&
    netAmount !== null &&
    vatAmount !== null
  ) {
    const sum =
      Math.round((netAmount + vatAmount) * 100) / 100;

    const diff = Math.abs(sum - grossAmount);

    if (diff > TOL(grossAmount)) {
      validationIssues.push({
        field: 'amounts',
        issue:
          `Net (${netAmount}) + VAT (${vatAmount}) = ` +
          `${sum} ≠ Gross (${grossAmount}) — check these values`,
      });

      fields.netAmount = {
        ...fields.netAmount,
        status: 'invalid',
      };

      fields.vatAmount = {
        ...fields.vatAmount,
        status: 'invalid',
      };

      fields.grossAmount = {
        ...fields.grossAmount,
        status: 'invalid',
      };
    }
  }

  // Validate:
  // net × VAT rate ≈ VAT amount
  if (
    netAmount !== null &&
    vatRate !== null &&
    vatAmount !== null
  ) {
    const expected =
      Math.round(
        (netAmount * vatRate / 100) * 100
      ) / 100;

    const diff = Math.abs(expected - vatAmount);

    if (diff > TOL(expected)) {
      validationIssues.push({
        field: 'vatRate',
        issue:
          `Net × ${vatRate}% = ${expected} ≠ ` +
          `extracted VAT amount (${vatAmount}) — verify rate`,
      });

      if (fields.vatRate.status !== 'invalid') {
        fields.vatRate = {
          ...fields.vatRate,
          status: 'review',
        };
      }
    }
  }

  // ============================================================================
  // Return
  // ============================================================================

  console.log('[FULL TEXT]', fullText);
  console.log('[PAGES]', pages);

  return {
    fields,
    validationIssues,
    moneyNeedsReview
  };
}
