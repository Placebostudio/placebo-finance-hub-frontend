/**
 * Credit-card statement parser.
 *
 * Generic heuristic approach: scan text lines for rows that contain
 * at least one date and at least one monetary amount — the signature
 * of a CC transaction row.
 *
 * Architecture is extensible: future provider-specific parsers can be
 * placed alongside this file and selected by the orchestrator based on
 * detected header patterns.
 *
 * Input: text and items from pdf-extractor.js
 * Output: array of raw transaction objects (statementId not yet assigned)
 */

import { generateId } from '@/lib/utils';

// ── Date patterns ─────────────────────────────────────────────────────────────
const DATE_RE = [
  /\b(\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})\b/g,      // YYYY-MM-DD
  /\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b/g,      // DD/MM/YYYY or MM/DD/YYYY
  /\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2})\b/g,      // DD/MM/YY
];

// ── Amount patterns ───────────────────────────────────────────────────────────
const AMOUNT_RE = [
  /(-?\d{1,3}(?:[.,]\d{3})+[,.]\d{2})/g,   // 1,234.56 or 1.234,56
  /(-?\d+[.,]\d{2})\b/g,                    // 1234.56 or 1234,56
];

// ── Currency detectors ────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS = { '₪': 'ILS', '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
const CURRENCY_CODES = ['ILS', 'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'NIS'];

function detectCurrency(text) {
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(sym)) return code;
  }
  for (const code of CURRENCY_CODES) {
    if (new RegExp(`\\b${code}\\b`, 'i').test(text)) return code;
  }
  return 'ILS';
}

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

// ── Noise lines ───────────────────────────────────────────────────────────────
const SKIP_LINE = [
  /^page\s+\d+/i,
  /^statement\s+(date|period|summary)/i,
  /^account\s+(number|no\.?|name|holder)/i,
  /^opening\s+balance/i,
  /^closing\s+balance/i,
  /^balance\s+forward/i,
  /^(?:total|sum)\s+(?:debits?|credits?|charges?|payments?)/i,
  /^minimum\s+payment/i,
  /^\s*[-=*_|]{3,}\s*$/,
];

function isNoiseLine(line) {
  return SKIP_LINE.some((p) => p.test(line.trim()));
}

// ── Header line detection ─────────────────────────────────────────────────────
const HEADER_WORDS = [
  'date', 'description', 'amount', 'debit', 'credit', 'balance',
  'posting', 'transaction', 'merchant', 'details', 'reference',
  // Hebrew
  'תאריך', 'תיאור', 'סכום', 'חיוב', 'זכות', 'יתרה',
];

function isHeaderLine(line) {
  const lower = line.toLowerCase();
  return HEADER_WORDS.filter((w) => lower.includes(w)).length >= 2;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseDate(str) {
  const s = str.trim();

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  let m = s.match(
    /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/
  );

  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    const d = new Date(year, month - 1, day);

    if (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    ) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY / DD-MM-YYYY / DD.MM.YYYY
  m = s.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/
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
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // DD/MM/YY
  m = s.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/
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
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

// ── Date extraction from a line ───────────────────────────────────────────────
/**
 * Extract all recognisable dates from a single text line.
 * Returns an array of YYYY-MM-DD strings (deduped, in order of appearance).
 */
function extractDates(line) {
  const found = [];
  const seen = new Set();
  for (const re of DATE_RE) {
    const cloned = new RegExp(re.source, re.flags);
    let m;
    while ((m = cloned.exec(line)) !== null) {
      const raw = m[1];
      if (seen.has(raw)) continue;
      seen.add(raw);
      const parsed = parseDate(raw);
      if (parsed) found.push(parsed);
    }
  }
  return found;
}

// ── Amount helpers ────────────────────────────────────────────────────────────
function parseAmount(raw) {
  let s = String(raw).replace(/[₪$€£¥\s]/g, '').trim();
  // European 1.234,56
  if (/^-?\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,(\d{3})/g, '$1').replace(',', '.');
  }
  return parseFloat(s);
}

function extractAmounts(line) {
  const found = [];
  const seen = new Set();
  for (const re of AMOUNT_RE) {
    const cloned = new RegExp(re.source, re.flags);
    let m;
    while ((m = cloned.exec(line)) !== null) {
      const raw = m[1];
      if (seen.has(raw)) continue;
      seen.add(raw);
      const v = parseAmount(raw);
      if (!isNaN(v)) found.push({ raw, value: v });
    }
  }
  return found;
}

// ── Line reconstruction from PDF items ───────────────────────────────────────
/**
 * Groups PDF text items by Y position (within LINE_Y_TOLERANCE) and sorts
 * each group by X to reconstruct reading order.
 */
function reconstructLines(items) {
  if (!items || items.length === 0) return [];
  const LINE_TOLERANCE = 5; // pixels

  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const lastY = current[current.length - 1].y;
    if (Math.abs(item.y - lastY) <= LINE_TOLERANCE) {
      current.push(item);
    } else {
      rows.push(current.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '));
      current = [item];
    }
  }
  if (current.length > 0) {
    rows.push(current.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '));
  }

  return rows;
}

// ── Transaction line parsing ──────────────────────────────────────────────────
function parseTransactionLine(line, defaultCurrency) {
  if (isNoiseLine(line) || line.trim().length < 8) return null;

  const dates = extractDates(line);
  if (dates.length === 0) return null;

  const amounts = extractAmounts(line);
  if (amounts.length === 0) return null;

  const transactionDate = dates[0];
  const postingDate = dates.length > 1 ? dates[1] : transactionDate;

  // Billed amount = last amount on line (rightmost column in a table)
  const billedEntry = amounts[amounts.length - 1];
  const originalEntry = amounts.length > 1 ? amounts[0] : billedEntry;

  const currency = detectCurrency(line) || defaultCurrency;

  // Description: strip out dates and amounts, clean up
  let desc = line;
  for (const dateStr of dates) {
    // Remove the raw date string
    desc = desc.replace(new RegExp(dateStr.replace(/\//g, '[/\\-\\.]'), 'g'), '');
  }
  for (const { raw } of amounts) {
    desc = desc.replace(raw, '');
  }
  // Remove currency markers
  desc = desc.replace(/[₪$€£¥]/g, '');
  desc = desc.replace(new RegExp(`\\b(${CURRENCY_CODES.join('|')})\\b`, 'gi'), '');
  desc = desc.replace(/\s+/g, ' ').trim().replace(/^[,.\-|;:]+|[,.\-|;:]+$/g, '').trim();
  if (!desc || desc.length < 2) desc = 'Transaction';

  return {
    id: generateId(),
    transactionDate,
    postingDate,
    description: desc,
    normalizedDescription: desc.toLowerCase().trim(),
    originalAmount: Math.abs(originalEntry.value),
    originalCurrency: currency,
    billedAmount: Math.abs(billedEntry.value),
    billedCurrency: currency,
    cardLastFour: '',
    status: 'unmatched',
    _raw: line,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a credit-card statement from extracted PDF data.
 *
 * @param {string} fullText
 * @param {{ pageNum:number, text:string, items:object[] }[]} pages
 * @returns {{ transactions, confidence, extractedText, issues }}
 */
export function parseStatement(fullText, pages = [], country = null) {
  const defaultCurrency =
  COUNTRY_DEFAULT_CURRENCIES[country] || 'ILS';

  // Build line list, preferring item-reconstructed lines for better table support
  let allLines = [];
  for (const p of pages) {
    if (p.items && p.items.length > 0) {
      allLines = allLines.concat(reconstructLines(p.items));
    } else {
      allLines = allLines.concat(p.text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean));
    }
  }
  if (allLines.length === 0) {
    allLines = fullText.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  }

  const transactions = [];
  const issues = [];
  let inTransactionBlock = false;

  for (const line of allLines) {
    if (!inTransactionBlock && isHeaderLine(line)) {
      inTransactionBlock = true;
      continue;
    }
    const txn = parseTransactionLine(line, defaultCurrency);
    if (txn) transactions.push(txn);
  }

  // If no header was found but we still found some transactions, keep them
  // (some statements don't have clear headers)

  // Deduplication: remove rows with same date + same amount + very similar description
  const deduped = [];
  for (const txn of transactions) {
    const dup = deduped.some(
      (t) =>
        t.transactionDate === txn.transactionDate &&
        Math.abs(t.billedAmount - txn.billedAmount) < 0.01 &&
        (t.description.slice(0, 15).toLowerCase() === txn.description.slice(0, 15).toLowerCase())
    );
    if (!dup) deduped.push(txn);
  }

  if (deduped.length === 0) {
    issues.push(
      'No transaction rows could be detected automatically. ' +
      'The statement layout may not be supported by the generic parser. ' +
      'You can add transactions manually in the table below.'
    );
  }

  return {
    transactions: deduped,
    confidence: deduped.length > 0 ? 'partial' : 'none',
    extractedText: fullText,
    issues,
  };
}
