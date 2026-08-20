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

import { detectCountry, getCountryVatRate } from '@/config/vat-config';

// ── Keyword dictionaries (extend to add more languages) ──────────────────────

const DOCUMENT_TYPE_PATTERNS = {
  invoice: /\b(invoice|חשבונית|bill|billing|faktura|factura|rechnung)\b/i,

  receipt: /\b(receipt|קבלה|reçu|quittung|ricevuta|kvitto)\b/i,

  credit_note: /\b(credit\s*note|credit\s*memo|gutschrift|note\s*de\s*crédit)\b/i,

  withdrawal: /\b(withdrawal|withdraw|cash\s*withdrawal|משיכה)\b/i,

  deposit: /\b(deposit|cash\s*deposit|הפקדה)\b/i,
};

const INVOICE_NUMBER_PATTERNS = [
  /invoice\s*(?:no\.?|number|num\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,20})/i,
  /inv\.?\s*(?:no\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,20})/i,
  /(?:receipt|ref(?:erence)?)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,20})/i,
  /(?:order|po)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,20})/i,
  /(?:חשבונית|קבלה|מספר)\s*:?\s*([A-Z0-9][A-Z0-9\-\/]{2,20})/i,
  /#\s*([A-Z0-9][A-Z0-9\-\/]{3,20})\b/i,
];

const DATE_LABEL_PATTERNS = [
  /(?:invoice|document|issued?|receipt|bill|billing|trans(?:action)?)\s*date\s*[:\-]?\s*(.+)/i,
  /(?:date|תאריך)\s*[:\-]\s*(.+)/i,
];

const DUE_DATE_LABEL_PATTERNS = [
  /(?:due|payment|pay\s+by|due\s+date)\s*[:\-]?\s*(.+)/i,
  /(?:תשלום\s+עד|לתשלום\s+עד)\s*[:\-]?\s*(.+)/i,
];

const GROSS_LABEL_PATTERNS = [
  /(?:grand\s+)?total\s+(?:amount\s+)?(?:due|paid|payable)?\s*[:\-]?\s*([\d,. ]+)/i,
  /amount\s+(?:due|total|paid|payable)\s*[:\-]?\s*([\d,. ]+)/i,
  /total\s*[:\-]?\s*([\d,. ]+)/i,
  /(?:סה"כ|סכום\s+כולל|לתשלום|סה"כ\s+לתשלום)\s*[:\-]?\s*([\d,. ]+)/i,
  /(?:summe\s+gesamt|montant\s+total|importe\s+total)\s*[:\-]?\s*([\d,. ]+)/i,
];

const NET_LABEL_PATTERNS = [
  /(?:sub\s*total|net\s+amount|taxable\s+amount|before\s+tax|exc(?:l)?\.?\s+(?:vat|tax))\s*[:\-]?\s*([\d,. ]+)/i,
  /(?:netto|montant\s+ht|base\s+imponible|subtotal)\s*[:\-]?\s*([\d,. ]+)/i,
  /(?:סה"כ\s+לפני\s+מע"מ|לפני\s+מע"מ|נטו)\s*[:\-]?\s*([\d,. ]+)/i,
];

const VAT_AMOUNT_LABEL_PATTERNS = [
  // Tax (13%) $456.30
  /(?:vat|tax|gst|hst|pst|tva|mwst|iva|מע"מ|מס\s+ערך\s+מוסף)\s*\(?\s*[\d.]+\s*%\s*\)?\s*[$€£₪]?\s*([\d,. ]+)/i,

  // VAT amount: $456.30
  /(?:vat|gst|hst|pst|tva|mwst|iva|מע"מ)\s+(?:amount)\s*[:\-]?\s*[$€£₪]?\s*([\d,. ]+)/i,

  // Tax: $456.30
  /(?:tax|מס\s+ערך\s+מוסף)\s*[:\-]\s*[$€£₪]?\s*([\d,. ]+)/i,
];

const VAT_RATE_PATTERNS = [
  // Tax (13%)
  /(?:vat|tax|gst|hst|pst|tva|mwst|iva|מע"מ|מס)\s*\(?\s*([\d.]+)\s*%\s*\)?/i,

  // 13% Tax
  /([\d.]+)\s*%\s*(?:vat|tax|gst|hst|pst|tva|mwst|iva|מע"מ|מס)/i,
];

const CURRENCY_DETECTORS = [
  { code: 'ILS', patterns: [/₪/, /\bils\b/i, /\bnis\b/i, /שקל/, /ש"ח/] },
  { code: 'USD', patterns: [/\$/, /\busd\b/i, /\bus\s*dollar/i] },
  { code: 'EUR', patterns: [/€/, /\beur\b/i, /\beuro\b/i] },
  { code: 'GBP', patterns: [/£/, /\bgbp\b/i, /\bsterling\b/i, /\bpound\b/i] },
  { code: 'CHF', patterns: [/\bchf\b/i, /\bswiss\s*franc\b/i] },
  { code: 'SEK', patterns: [/\bsek\b/i] },
];

// Lines whose content should never be used as a vendor name
const VENDOR_SKIP = /^(invoice|receipt|tax\s+invoice|bill|statement|date|total|amount|page|ref|no\.|חשבונית|קבלה|מסמך)/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  let m = s.match(/\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  m = s.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }

  // DD/MM/YY
  m = s.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})\b/);
  if (m) {
    const year = +m[3] < 70 ? 2000 + +m[3] : 1900 + +m[3];
    const d = new Date(year, +m[2] - 1, +m[1]);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }

  // Natural: "15 Jan 2026", "Jan 15, 2026", etc.
  const parsed = new Date(s);
  if (!isNaN(parsed) && s.length > 4) return parsed.toISOString().split('T')[0];

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
  if (!raw) return null;
  let s = String(raw).replace(/[₪$€£¥\s]/g, '');
  // European format: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,(\d{3})/g, '$1').replace(',', '.');
  }
  const v = parseFloat(s);
  return isNaN(v) ? null : Math.abs(v);
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
  for (const { code, patterns } of CURRENCY_DETECTORS) {
    if (patterns.some((p) => p.test(text))) return code;
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
export function parseReceipt(fullText, pages = []) {
  const lines = fullText.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  const fields = {};

  // ── Document type ──────────────────────────────────────────────────────────
  let docType = null;
  let docTypeLine = '';
  for (const [type, pattern] of Object.entries(DOCUMENT_TYPE_PATTERNS)) {
    const line = lines.find((l) => pattern.test(l));
    if (line) { docType = type; docTypeLine = line; break; }
  }
  fields.documentType = docType
    ? makeField(docType, 'found', docTypeLine, 'keyword')
    : makeField('receipt', 'review', '', 'default');

  // ── Vendor name ───────────────────────────────────────────────────────────
  let vendorName = null;
  let vendorLine = '';
  for (const line of lines.slice(0, 12)) {
    if (line.length < 2) continue;
    if (VENDOR_SKIP.test(line)) continue;
    if (/^[\d\/\-\.\s]+$/.test(line)) continue;
    if (/^[#*\-=_|>]+$/.test(line)) continue;
    const amtHit = findAmountInLine(line);
    if (amtHit && line.length < 25) continue;
    vendorName = line;
    vendorLine = line;
    break;
  }
  fields.vendorName = vendorName
    ? makeField(vendorName, 'review', vendorLine, 'first_meaningful_line')
    : missing();

  // ── Document number ───────────────────────────────────────────────────────
  let docNumber = null;
  let docNumberLine = '';
  outer: for (const pattern of INVOICE_NUMBER_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m && m[1]) { docNumber = m[1]; docNumberLine = line; break outer; }
    }
  }
  fields.documentNumber = docNumber
    ? makeField(docNumber, 'found', docNumberLine, 'pattern')
    : missing();

  // ── Document date ─────────────────────────────────────────────────────────
  let docDate = null;
  let docDateLine = '';
  outer2: for (const pattern of DATE_LABEL_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const d = extractDateFromFragment(m[1] ?? m[0]);
        if (d) { docDate = d; docDateLine = line; break outer2; }
      }
    }
  }
  if (!docDate) {
    for (const line of lines.slice(0, 20)) {
      const d = extractDateFromFragment(line);
      if (d) { docDate = d; docDateLine = line; break; }
    }
  }
  fields.documentDate = docDate
    ? makeField(docDate, 'found', docDateLine, 'pattern')
    : missing();

  // ── Due date ──────────────────────────────────────────────────────────────
  let dueDate = null;
  let dueDateLine = '';
  outer3: for (const pattern of DUE_DATE_LABEL_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const d = extractDateFromFragment(m[1] ?? m[0]);
        if (d && d !== docDate) { dueDate = d; dueDateLine = line; break outer3; }
      }
    }
  }
  fields.dueDate = dueDate
    ? makeField(dueDate, 'found', dueDateLine, 'pattern')
    : missing();

  // ── Currency ──────────────────────────────────────────────────────────────
  const currency = detectCurrency(fullText);
  fields.currency = currency
    ? makeField(currency, 'found', '', 'symbol')
    : makeField('ILS', 'review', '', 'default');

  // ── VAT rate (explicit on receipt) ────────────────────────────────────────
  let vatRate = null;
  let vatRateLine = '';
  let vatRateMethod = 'pattern';
  outer4: for (const pattern of VAT_RATE_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const r = parseFloat(m[1]);
        if (!isNaN(r) && r >= 0 && r <= 100) {
          vatRate = r;
          vatRateLine = line;
          break outer4;
        }
      }
    }
  }

  // ── Country detection ─────────────────────────────────────────────────────
  const countryDetected = detectCountry(fullText);
  if (countryDetected) {
    fields.country = {
      value: countryDetected.code,
      countryName: countryDetected.name,
      confidence: countryDetected.confidence,
      status: countryDetected.confidence === 'low' ? 'review' : 'found',
      sourceText: countryDetected.reason,
      method: 'country_detection',
      page: null,
    };
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

  // ── VAT rate fallback: use country standard rate ───────────────────────────
  // Only when:
  //   1. No explicit VAT rate found on the receipt
  //   2. Country detected with medium or high confidence
  // Explicit receipt VAT always wins over country default.
  if (vatRate === null && countryDetected &&
    (countryDetected.confidence === 'high' || countryDetected.confidence === 'medium')) {
    const countryVat = getCountryVatRate(countryDetected.code);
    if (countryVat !== null) {
      vatRate = countryVat;
      vatRateLine = `Standard rate for ${countryDetected.name}: ${countryVat}%`;
      vatRateMethod = 'country_default';
    }
  }

  fields.vatRate = vatRate !== null
    ? makeField(vatRate, vatRateMethod === 'country_default' ? 'review' : 'found', vatRateLine, vatRateMethod)
    : missing();

  // ── Gross amount ──────────────────────────────────────────────────────────
  let grossAmount = null;
  let grossAmountLine = '';
  outer5: for (const pattern of GROSS_LABEL_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const v = parseAmount(m[1]);
        if (v !== null && v > 0) { grossAmount = v; grossAmountLine = line; break outer5; }
      }
    }
  }
  if (grossAmount === null) {
    for (const line of lines) {
      if (/\btotal\b|סה"כ|amount\s+due/i.test(line)) {
        const hit = findAmountInLine(line);
        if (hit) { grossAmount = hit.value; grossAmountLine = line; break; }
      }
    }
  }
  fields.grossAmount = grossAmount !== null
    ? makeField(grossAmount, 'found', grossAmountLine, 'keyword')
    : missing();

  // ── Net amount ────────────────────────────────────────────────────────────
  let netAmount = null;
  let netAmountLine = '';
  outer6: for (const pattern of NET_LABEL_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const v = parseAmount(m[1]);
        if (v !== null && v > 0) { netAmount = v; netAmountLine = line; break outer6; }
      }
    }
  }
  fields.netAmount = netAmount !== null
    ? makeField(netAmount, 'found', netAmountLine, 'keyword')
    : missing();

  // ── VAT amount ────────────────────────────────────────────────────────────
  let vatAmount = null;
  let vatAmountLine = '';
  outer7: for (const pattern of VAT_AMOUNT_LABEL_PATTERNS) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) {
        const v = parseAmount(m[1]);
        if (v !== null && v > 0) { vatAmount = v; vatAmountLine = line; break outer7; }
      }
    }
  }
  fields.vatAmount = vatAmount !== null
    ? makeField(vatAmount, 'found', vatAmountLine, 'keyword')
    : missing();

  // ── Arithmetic derivation ─────────────────────────────────────────────────
  // Fill in one or two missing amounts if others are known.

  // 1. gross + vatAmount → net
  if (grossAmount !== null && vatAmount !== null && netAmount === null) {
    const derived = Math.round((grossAmount - vatAmount) * 100) / 100;
    if (derived > 0) {
      fields.netAmount = makeField(derived, 'review', 'derived: gross − vat', 'arithmetic');
      netAmount = derived;
    }
  }
  // 2. gross + net → vatAmount
  if (grossAmount !== null && netAmount !== null && vatAmount === null) {
    const derived = Math.round((grossAmount - netAmount) * 100) / 100;
    if (derived >= 0) {
      fields.vatAmount = makeField(derived, 'review', 'derived: gross − net', 'arithmetic');
      vatAmount = derived;
    }
  }
  // 3. net + vatAmount → gross
  if (netAmount !== null && vatAmount !== null && grossAmount === null) {
    const derived = Math.round((netAmount + vatAmount) * 100) / 100;
    fields.grossAmount = makeField(derived, 'review', 'derived: net + vat', 'arithmetic');
    grossAmount = derived;
  }
  // 4. gross + vatRate (no explicit net or vatAmount) → derive both
  //    net = gross / (1 + rate/100)   ← gross is already the total-paid amount
  if (grossAmount !== null && vatRate !== null && netAmount === null && vatAmount === null) {
    const rate = vatRate / 100;
    const derivedNet = Math.round((grossAmount / (1 + rate)) * 100) / 100;
    const derivedVat = Math.round((grossAmount - derivedNet) * 100) / 100;
    if (derivedNet > 0) {
      fields.netAmount = makeField(derivedNet, 'review',
        `derived: ${grossAmount} / (1 + ${vatRate}%)`, 'arithmetic');
      fields.vatAmount = makeField(derivedVat, 'review',
        `derived: ${grossAmount} − ${derivedNet}`, 'arithmetic');
      netAmount = derivedNet;
      vatAmount = derivedVat;
    }
  }

  // ── Financial validation ──────────────────────────────────────────────────
  const validationIssues = [];
  const TOL = (v) => Math.max(0.05, Math.abs(v) * 0.005); // 0.5% or 5 cents

  // Validate: net + vatAmount ≈ gross
  if (grossAmount !== null && netAmount !== null && vatAmount !== null) {
    const sum = Math.round((netAmount + vatAmount) * 100) / 100;
    const diff = Math.abs(sum - grossAmount);
    if (diff > TOL(grossAmount)) {
      validationIssues.push({
        field: 'amounts',
        issue: `Net (${netAmount}) + VAT (${vatAmount}) = ${sum} ≠ Gross (${grossAmount}) — check these values`,
      });
      fields.netAmount = { ...fields.netAmount, status: 'invalid' };
      fields.vatAmount = { ...fields.vatAmount, status: 'invalid' };
      fields.grossAmount = { ...fields.grossAmount, status: 'invalid' };
    }
  }

  // Validate: net × vatRate% ≈ vatAmount
  if (netAmount !== null && vatRate !== null && vatAmount !== null) {
    const expected = Math.round(netAmount * vatRate / 100 * 100) / 100;
    const diff = Math.abs(expected - vatAmount);
    if (diff > TOL(expected)) {
      validationIssues.push({
        field: 'vatRate',
        issue: `Net × ${vatRate}% = ${expected} ≠ extracted VAT amount (${vatAmount}) — verify rate`,
      });
      if (fields.vatRate.status !== 'invalid') {
        fields.vatRate = { ...fields.vatRate, status: 'review' };
      }
    }
  }

  return { fields, validationIssues };
}
