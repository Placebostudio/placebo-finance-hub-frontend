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
const CURRENCY_CODES = ['ILS', 'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'NIS', 'SEK'];
const STATEMENT_FORMATS = {

  english: {
    columns: [
      "date",
      "to name/bank",
      "to account",
      "message/ocr",
      "own notes",
      "amount",
      "balance"
    ],

    numberFormat: "english",

    dateFormat: "iso",

    datePosition: "end"
  },

  swedish: {
    columns: [
      // Swedish headers
    ],

    numberFormat: "swedish",

    dateFormat: "iso",

    datePosition: "end"
  }
};

function detectCurrency(fullText) {

  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {

    if (fullText.includes(sym)) {
      return code;
    }
  }

  for (const code of CURRENCY_CODES) {

    if (
      new RegExp(`\\b${code}\\b`, "i")
        .test(fullText)
    ) {
      return code;
    }
  }

  return null;
}

function detectStatementFormat(fullText) {

  const text = String(fullText ?? "");

  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // ============================================================
  // TYPE A — ENGLISH BANK STATEMENT
  //
  // Date To name/bank To account Message/OCR Own notes Amount Balance
  // ============================================================

  const englishHeader =
    "date to name/bank to account message/ocr own notes amount balance";

  if (normalized.includes(englishHeader)) {

    return {
      type: "english"
    };
  }

  // ============================================================
  // TYPE B — SWEDISH TRANSACTION EXPORT
  //
  // Datum Följesedel Reseinformation/inköpsställe
  // Valuta Utl.belopp/Moms Belopp
  // ============================================================

  const swedishHeader =
    "datum följesedel reseinformation/inköpsställe valuta utl.belopp/moms belopp";

  if (normalized.includes(swedishHeader)) {

    return {
      type: "swedish"
    };
  }

  // ============================================================
  // UNKNOWN
  // ============================================================

  return {
    type: "unknown"
  };
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
function parseTransactionLine(line, defaultCurrency, statementFormat) {

  if (!line || typeof line !== "string") {
    return null;
  }

  const raw = line.trim();

  // ============================================================
  // ENGLISH BANK EXPORT
  // ============================================================

  if (statementFormat?.type === "english") {

    // ==========================================================
    // DATE
    // ==========================================================

    const dateMatch =
      raw.match(/^(\d{4}-\d{2}-\d{2})\s+/);

    if (!dateMatch) {
      return null;
    }

    const transactionDate = dateMatch[1];

    const remainder =
      raw.slice(dateMatch[0].length).trim();

    if (!remainder) {
      return null;
    }

    // ==========================================================
    // AMOUNT + BALANCE
    // ==========================================================

    const endingNumbers =
      /(-?\d+(?:\s+\d{3})*,\d{2})\s+(-?\d+(?:\s+\d{3})*,\d{2})\s*$/;

    const numberMatch =
      remainder.match(endingNumbers);

    if (!numberMatch) {
      return null;
    }

    const amountRaw =
      numberMatch[1];

    const balanceRaw =
      numberMatch[2];

    // ==========================================================
    // DESCRIPTION
    // ==========================================================

    const description =
      remainder
        .slice(0, numberMatch.index)
        .trim()
        .replace(/\s+\d[\d\s.,-]*$/, "")
        .trim();

    if (!description) {
      return null;
    }

    // ==========================================================
    // NUMBER PARSER
    // ==========================================================

    const parseEnglishStatementNumber = (value) => {

      if (!value) {
        return null;
      }

      const normalized =
        value
          .replace(/\s+/g, "")
          .replace(",", ".");

      const result =
        Number(normalized);

      return Number.isFinite(result)
        ? result
        : null;
    };

    const billedAmount =
      parseEnglishStatementNumber(amountRaw);

    if (billedAmount === null) {
      return null;
    }

    // ==========================================================
    // BALANCE
    // ==========================================================

    const balance =
      parseEnglishStatementNumber(balanceRaw);

    if (balance === null) {
      return null;
    }

    // ==========================================================
    // NORMALIZED DESCRIPTION
    // ==========================================================

    const normalizedDescription =
      description
        .toLowerCase()
        .replace(/\d+(?:[.,]\d+)?/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // ==========================================================
    // TRANSACTION
    // ==========================================================

    return {
      id: crypto.randomUUID(),

      transactionDate,

      postingDate: null,

      description,

      normalizedDescription,

      counterpartyRef: null,

      originalAmount: null,

      originalCurrency: null,

      statementFxRate: null,

      billedAmount,

      billedCurrency:
        defaultCurrency || "SEK",

      status: "unmatched",

      coverageState: "unmatched",

      ignoreReason: null,

      rowHash:
        `${transactionDate}|${description}|${billedAmount}|${balance}`,

      balance
    };
  }


  // ============================================================
  // SWEDISH BANK EXPORT
  //
  // Example:
  //
  // 260510 Zara com Arteixo 2.117,00
  //
  // Foreign example:
  //
  // 260510 Zara com Arteixo USD 25 237,78
  //
  // First amount = foreign amount
  // Second amount = final SEK amount
  //
  // If only one amount exists:
  //
  // 260510 Zara com Arteixo 2.117,00
  //
  // That amount is the SEK billed amount.
  // ============================================================

  if (statementFormat?.type === "swedish") {

    // ==========================================================
    // DATE
    // ==========================================================

    const dateMatch =
      raw.match(/^(\d{6})\s+/);

    if (!dateMatch) {
      return null;
    }

    const dateRaw =
      dateMatch[1];

    const transactionDate =
      `20${dateRaw.slice(0, 2)}-${dateRaw.slice(2, 4)}-${dateRaw.slice(4, 6)}`;

    // ==========================================================
    // REMAINDER
    // ==========================================================

    const remainder =
      raw.slice(dateMatch[0].length).trim();

    if (!remainder) {
      return null;
    }

    // ==========================================================
    // NUMBER PARSER
    //
    // Swedish format:
    //
    // 2.117,00
    // 10.000,50
    // 123,45
    //
    // "." = thousands
    // "," = decimals
    // ==========================================================

    const parseSwedishNumber = (value) => {

      if (!value) {
        return null;
      }

      const normalized =
        value
          .replace(/\./g, "")
          .replace(",", ".");

      const result =
        Number(normalized);

      return Number.isFinite(result)
        ? result
        : null;
    };

    // ==========================================================
    // FIND ALL AMOUNTS AT THE END OF THE ROW
    //
    // This supports:
    //
    // 2.117,00
    //
    // USD 25 237,78
    //
    // EUR 100 1.234,56
    //
    // The final amount is always the SEK amount.
    // ==========================================================

    const amountPattern =
      /(-?\d+(?:\.\d{3})*,\d{2})/g;

    const amounts = [];

    let amountMatch;

    while (
      (amountMatch = amountPattern.exec(remainder)) !== null
    ) {

      amounts.push({
        raw: amountMatch[1],
        index: amountMatch.index,
        end:
          amountMatch.index +
          amountMatch[0].length
      });
    }

    if (amounts.length === 0) {
      return null;
    }

    // ==========================================================
    // FINAL AMOUNT
    //
    // The last amount in the row is the SEK amount.
    // ==========================================================

    const finalAmount =
      amounts[amounts.length - 1];

    const billedAmount =
      parseSwedishNumber(finalAmount.raw);

    if (billedAmount === null) {
      return null;
    }

    // ==========================================================
    // FOREIGN AMOUNT
    //
    // If there are two amounts:
    //
    // USD 25 237,78
    //
    // first = 25 USD
    // second = 237,78 SEK
    //
    // If there is only one amount:
    //
    // 2.117,00
    //
    // no foreign amount.
    // ==========================================================

    let originalAmount = null;
    let originalCurrency = null;

    if (amounts.length >= 2) {

      const foreignAmount =
        amounts[amounts.length - 2];

      originalAmount =
        parseSwedishNumber(
          foreignAmount.raw
        );

      // ========================================================
      // FIND CURRENCY BETWEEN DESCRIPTION AND FOREIGN AMOUNT
      // ========================================================

      const beforeForeignAmount =
        remainder
          .slice(
            0,
            foreignAmount.index
          )
          .trim();

      const currencyMatch =
        beforeForeignAmount.match(
          /\b(USD|EUR|GBP|NOK|DKK|CHF|PLN|SEK)\b/i
        );

      if (currencyMatch) {

        originalCurrency =
          currencyMatch[1].toUpperCase();
      }

      // If the detected currency is SEK,
      // it isn't really a foreign amount.
      if (originalCurrency === "SEK") {

        originalAmount = null;
        originalCurrency = null;
      }
    }

    // ==========================================================
    // DESCRIPTION
    //
    // Everything before the first relevant amount.
    // ==========================================================

    const descriptionEnd =
      amounts.length >= 2
        ? amounts[amounts.length - 2].index
        : finalAmount.index;

    let description =
      remainder
        .slice(0, descriptionEnd)
        .trim();

    // ==========================================================
    // REMOVE FOREIGN CURRENCY FROM DESCRIPTION
    //
    // Example:
    //
    // Zara com Arteixo USD 25
    //
    // becomes:
    //
    // Zara com Arteixo
    // ==========================================================

    if (originalCurrency) {

      description =
        description
          .replace(
            new RegExp(
              `\\b${originalCurrency}\\b`,
              "i"
            ),
            ""
          )
          .trim();

      // Remove the foreign numeric amount
      description =
        description
          .replace(
            /\s+-?\d+(?:\.\d{3})*,\d{2}\s*$/,
            ""
          )
          .trim();
    }

    // ==========================================================
    // REMOVE NUMERIC REFERENCE AT END
    // ==========================================================

    description =
      description
        .replace(
          /\s+\d[\d\s.,-]*$/,
          ""
        )
        .trim();

    if (!description) {
      return null;
    }

    // ==========================================================
    // NORMALIZED DESCRIPTION
    // ==========================================================

    const normalizedDescription =
      description
        .toLowerCase()
        .replace(/\d+(?:[.,]\d+)?/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // ==========================================================
    // TRANSACTION
    // ==========================================================

    const transaction = {

      id: crypto.randomUUID(),

      transactionDate,

      postingDate: null,

      description,

      normalizedDescription,

      counterpartyRef: null,

      originalAmount,

      originalCurrency,

      statementFxRate: null,

      billedAmount,

      billedCurrency: "SEK",

      status: "unmatched",

      coverageState: "unmatched",

      ignoreReason: null,

      rowHash:
        `${transactionDate}|${description}|${billedAmount}|${originalAmount ?? ""}|${originalCurrency ?? ""}`
    };

    return transaction;
  }


  // ============================================================
  // UNSUPPORTED FORMAT
  // ============================================================

  return null;
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

  // ============================================================
  // DETECT STATEMENT FORMAT
  // ============================================================

  const statementFormat = detectStatementFormat(fullText);

  // console.log(
  //   "STATEMENT FORMAT:",
  //   statementFormat.type
  // );

  // ============================================================
  // DETECT CURRENCY
  // ============================================================

  const detectedCurrency = detectCurrency(fullText);

  const defaultCurrency =
    statementFormat.type === "swedish"
      ? "SEK"
      : (
        detectedCurrency ||
        statementFormat.defaultCurrency ||
        null
      );

  // ============================================================
  // BUILD LINE LIST
  // ============================================================

  let allLines = [];

  for (const p of pages) {

    if (p.items && p.items.length > 0) {

      const reconstructed =
        reconstructLines(p.items);

      allLines = allLines.concat(reconstructed);

    } else if (p.text) {

      allLines = allLines.concat(
        p.text
          .split(/[\n\r]+/)
          .map((l) => l.trim())
          .filter(Boolean)
      );
    }
  }

  // ============================================================
  // FALLBACK TO FULL TEXT
  // ============================================================

  if (allLines.length === 0) {

    allLines =
      fullText
        .split(/[\n\r]+/)
        .map((l) => l.trim())
        .filter(Boolean);
  }

  // console.log("TOTAL LINES:", allLines.length);

  // Useful for debugging the actual OCR/PDF reconstruction
  // console.log("STATEMENT LINES:");

  // allLines.forEach((line, index) => {
  //   console.log(index, JSON.stringify(line));
  // });

  // ============================================================
  // TRANSACTION PARSING
  // ============================================================

  const transactions = [];
  const issues = [];

  let inTransactionBlock = false;

  // console.log("========== PDF PARSER DEBUG ==========");
  // console.log("FORMAT:", statementFormat.type);
  // console.log("CURRENCY:", defaultCurrency);
  // console.log("LINES:", allLines.length);

  for (const [index, line] of allLines.entries()) {

    // console.log(`[${index}]`, JSON.stringify(line));

    // ----------------------------------------------------------
    // Detect transaction table header
    // ----------------------------------------------------------

    if (!inTransactionBlock) {

      // ==========================================================
      // ENGLISH HEADER
      // ==========================================================

      if (
        statementFormat.type === "english" &&
        isHeaderLine(line)
      ) {

        inTransactionBlock = true;

        // console.log(
        //   ">>> ENGLISH TRANSACTION HEADER FOUND:",
        //   line
        // );

        continue;
      }

      // ==========================================================
      // SWEDISH HEADER
      //
      // Datum Följesedel Reseinformation/inköpsställe
      // Valuta Utl.belopp/Moms Belopp
      // ==========================================================

      if (
        statementFormat.type === "swedish" &&
        line.toLowerCase().includes("datum") &&
        line.toLowerCase().includes("följesedel") &&
        line.toLowerCase().includes("reseinformation/inköpsställe") &&
        line.toLowerCase().includes("valuta") &&
        line.toLowerCase().includes("belopp")
      ) {

        inTransactionBlock = true;

        // console.log(
        //   ">>> SWEDISH TRANSACTION HEADER FOUND:",
        //   line
        // );

        continue;
      }
    }

    // ----------------------------------------------------------
    // Ignore everything before the transaction table
    // ----------------------------------------------------------

    if (!inTransactionBlock) {
      continue;
    }

    // ----------------------------------------------------------
    // Parse transaction
    // ----------------------------------------------------------

    const txn = parseTransactionLine(
      line,
      defaultCurrency,
      statementFormat
    );

    // console.log(
    //   ">>> PARSE RESULT:",
    //   txn
    // );

    if (txn) {
      transactions.push(txn);
    }
  }

  // console.log(
  //   ">>> RAW TRANSACTIONS:",
  //   transactions
  // );

  // ============================================================
  // DEDUPLICATION
  // ============================================================

  const deduped = [];

  for (const txn of transactions) {

    const duplicate =
      deduped.some((existing) => {

        return (
          existing.rowHash &&
          txn.rowHash &&
          existing.rowHash === txn.rowHash
        );

      });

    if (!duplicate) {
      deduped.push(txn);
    }
  }

  // ============================================================
  // RESULT
  // ============================================================

  if (deduped.length === 0) {

    issues.push(
      "No transaction rows could be detected automatically. " +
      "The statement layout may not be supported by the " +
      "current parser."
    );
  }

  // console.log(
  //   "FINAL TRANSACTIONS:",
  //   deduped
  // );

  return {
    transactions: deduped,

    confidence:
      deduped.length > 0
        ? "partial"
        : "none",

    extractedText: fullText,

    issues,
  };
}
