/**
 * PDF report generation.
 * Uses jsPDF + jspdf-autotable — entirely client-side.
 *
 * Report structure:
 *   Page 1        — Cover: company, period, summary statistics
 *   Pages 2+      — Approved expense records (table)
 *   Appendix      — Source documents: for each expense, expense details
 *                   followed by the original receipt/invoice image
 *   Final pages   — CC transactions, unmatched items
 *
 * Receipt embedding:
 *   Image files   — embedded directly as JPEG/PNG
 *   PDF receipts  — first page rendered to canvas via PDF.js, then embedded as JPEG
 *
 * Known limitation: jsPDF's built-in fonts do not support Hebrew/RTL text.
 * Hebrew vendor names will appear as question marks in the PDF. The Excel
 * export handles Hebrew correctly.
 */

import { fileDB } from '@/storage/db';

// ── Layout constants (A4 mm) ─────────────────────────────────────────────────
const PW = 210; // page width
const PH = 297; // page height
const ML = 14;  // margin left
const MR = 14;  // margin right
const MT = 14;  // margin top
const MB = 16;  // margin bottom
const CW = PW - ML - MR;  // content width = 182
const MAX_Y = PH - MB;

const BRAND_BLUE = [37, 99, 235];   // rgb
const GRAY_100  = [245, 245, 245];
const GRAY_400  = [156, 163, 175];
const GRAY_700  = [55, 65, 81];
const BLACK     = [17, 24, 39];
const GREEN     = [22, 163, 74];
const RED       = [220, 38, 38];
const YELLOW    = [202, 138, 4];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtAmt(amount, currency = '') {
  if (amount == null || isNaN(amount)) return '';
  return `${currency} ${Math.abs(amount).toFixed(2)}`.trim();
}

function fmtPayment(method) {
  return {
    credit_card: 'Credit Card',
    bank_transfer: 'Bank Transfer',
    cash: 'Cash',
    other: 'Other',
    unknown: 'Unknown',
  }[method] ?? method ?? '';
}

function setColor(doc, [r, g, b]) {
  doc.setTextColor(r, g, b);
}

function setFill(doc, [r, g, b]) {
  doc.setFillColor(r, g, b);
}

function setDraw(doc, [r, g, b]) {
  doc.setDrawColor(r, g, b);
}

/** Ensure there is at least `needed` mm before bottom margin. Returns new Y. */
function ensureSpace(doc, y, needed) {
  if (y + needed > MAX_Y) {
    doc.addPage();
    return MT + 2;
  }
  return y;
}

/** Draw a coloured rect (filled) */
function fillRect(doc, x, y, w, h, colour) {
  setFill(doc, colour);
  doc.rect(x, y, w, h, 'F');
}

/** Horizontal rule */
function hRule(doc, y, colour = GRAY_400) {
  setDraw(doc, colour);
  doc.setLineWidth(0.2);
  doc.line(ML, y, ML + CW, y);
}

/** Left-aligned text shortcut */
function txt(doc, text, x, y, opts = {}) {
  doc.text(String(text ?? ''), x, y, opts);
}

/** Section heading */
function sectionHeading(doc, text, y) {
  y = ensureSpace(doc, y, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setColor(doc, BRAND_BLUE);
  txt(doc, text.toUpperCase(), ML, y);
  hRule(doc, y + 1.5, BRAND_BLUE);
  doc.setFont('helvetica', 'normal');
  setColor(doc, BLACK);
  return y + 7;
}

/** Convert a Blob to a base64 data URL */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Get natural pixel dimensions of an image data URL */
function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Calculate mm dimensions that fit within maxW × maxH while preserving aspect ratio.
 */
function fitDimensions(pixW, pixH, maxWmm, maxHmm) {
  if (!pixW || !pixH) return { wMm: maxWmm, hMm: maxHmm / 2 };
  const aspect = pixW / pixH;
  let wMm = maxWmm;
  let hMm = wMm / aspect;
  if (hMm > maxHmm) {
    hMm = maxHmm;
    wMm = hMm * aspect;
  }
  return { wMm, hMm };
}

/**
 * Load a receipt file from IndexedDB and convert to an image object
 * ready to embed in jsPDF.
 *
 * For PDF files, the first page is rendered to a canvas at 1.5× scale
 * and converted to JPEG.
 *
 * @returns {{ dataUrl, format, pixW, pixH } | null}
 */
async function loadReceiptImage(documentId, fileType) {
  if (!documentId) return null;
  try {
    const blob = await fileDB.getDocumentFile(documentId);
    if (!blob) return null;

    if (fileType === 'application/pdf') {
      // Render first page of the PDF receipt to canvas
      const { renderPDFPages } = await import('../extraction/pdf-extractor');
      const canvases = await renderPDFPages(blob, () => {});
      if (!canvases || canvases.length === 0) return null;
      const canvas = canvases[0];
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      return { dataUrl, format: 'JPEG', pixW: canvas.width, pixH: canvas.height };
    } else {
      // Image file — read directly
      const dataUrl = await blobToDataUrl(blob);
      const { w: pixW, h: pixH } = await getImageDimensions(dataUrl);
      const format = fileType === 'image/png' ? 'PNG' : 'JPEG';
      return { dataUrl, format, pixW, pixH };
    }
  } catch {
    return null;
  }
}

/**
 * Add a page footer with page number.
 */
function addFooter(doc, pageLabel = '') {
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setColor(doc, GRAY_400);
    txt(doc, `Page ${i} of ${totalPages}${pageLabel ? '  ·  ' + pageLabel : ''}`, ML, PH - 6);
    txt(doc, 'Generated by Placebo Finance Hub', ML + CW, PH - 6, { align: 'right' });
  }
}

// ── Cover page ────────────────────────────────────────────────────────────────

function buildCoverPage(doc, data) {
  const { periodLabel, companyName, generatedAt, summary } = data;

  // Header bar
  fillRect(doc, 0, 0, PW, 44, BRAND_BLUE);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  setColor(doc, [255, 255, 255]);
  txt(doc, companyName, ML, 20);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  txt(doc, 'Monthly Financial Report', ML, 30);
  txt(doc, periodLabel, ML, 38);

  // Period / generated
  setColor(doc, GRAY_700);
  doc.setFontSize(8);
  txt(doc, `Generated ${fmtDate(generatedAt)}`, ML, 50);

  let y = 62;

  // Summary boxes
  const boxes = [
    { label: 'Total Expenses', value: summary.totalExpenses, sub: `${summary.approvedExpenses} approved` },
    { label: 'Total Gross', value: fmtAmt(summary.totalGross, summary.defaultCurrency), sub: `VAT: ${fmtAmt(summary.totalVat, summary.defaultCurrency)}` },
    { label: 'CC Reconciled', value: `${summary.matchedCC} / ${summary.ccExpenses}`, sub: 'credit-card expenses' },
    { label: 'Missing Receipts', value: summary.unmatchedTxns, sub: 'transactions without receipt' },
  ];

  const boxW = (CW - 9) / 4;
  boxes.forEach(({ label, value, sub }, i) => {
    const bx = ML + i * (boxW + 3);
    fillRect(doc, bx, y, boxW, 22, GRAY_100);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    setColor(doc, GRAY_700);
    txt(doc, label, bx + 3, y + 6);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    setColor(doc, BLACK);
    txt(doc, String(value), bx + 3, y + 15);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setColor(doc, GRAY_400);
    txt(doc, sub, bx + 3, y + 20);
  });

  y += 30;

  // Readiness indicator
  const isReady = summary.unmatchedTxns === 0 && summary.draftExpenses === 0 && summary.expensesWithoutCharge === 0;
  const readyColour = isReady ? GREEN : YELLOW;
  fillRect(doc, ML, y, CW, 10, isReady ? [220, 252, 231] : [254, 249, 195]);
  setColor(doc, readyColour);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  txt(doc, isReady ? '✓  READY FOR ACCOUNTANT' : '⚠  NOT READY — ACTION REQUIRED', ML + 4, y + 6.5);
  if (!isReady) {
    const issues = [];
    if (summary.draftExpenses > 0) issues.push(`${summary.draftExpenses} draft expense(s)`);
    if (summary.unmatchedTxns > 0) issues.push(`${summary.unmatchedTxns} missing receipt(s)`);
    if (summary.expensesWithoutCharge > 0) issues.push(`${summary.expensesWithoutCharge} CC expense(s) without charge`);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(doc, GRAY_700);
    txt(doc, issues.join('  ·  '), ML + CW, y + 6.5, { align: 'right' });
  }

  return y + 18;
}

// ── Expenses table ────────────────────────────────────────────────────────────

async function buildExpensesTable(doc, data, autoTable) {
  const { expenses, confirmedMatches, transactions } = data;
  const matchedIds = new Set(confirmedMatches.map((m) => m.expenseId));

  doc.addPage();
  let y = MT;
  y = sectionHeading(doc, 'Approved Expense Records', y);

  const rows = expenses
    .filter((e) => e.status === 'approved')
    .map((e) => {
      const matched = matchedIds.has(e.id);
      return [
        fmtDate(e.documentDate),
        e.vendorName ?? '',
        e.documentNumber ?? '',
        fmtPayment(e.paymentMethod),
        e.currency ?? '',
        e.netAmount != null ? e.netAmount.toFixed(2) : '',
        e.vatRate > 0 ? `${e.vatRate}%` : '',
        e.grossAmount != null ? e.grossAmount.toFixed(2) : '',
        matched ? 'Matched' : (e.paymentMethod === 'credit_card' ? 'Unmatched' : 'N/A'),
      ];
    });

  autoTable(doc, {
    head: [['Date', 'Vendor', 'Doc No.', 'Payment', 'CCY', 'Net', 'VAT', 'Gross', 'Recon']],
    body: rows.length > 0 ? rows : [['', 'No approved expenses for this period', '', '', '', '', '', '', '']],
    startY: y,
    margin: { left: ML, right: MR },
    styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: GRAY_100 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 38 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { cellWidth: 10 },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 12, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' },
      8: { cellWidth: 18 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 8) {
        const val = data.cell.text[0];
        if (val === 'Matched') data.cell.styles.textColor = GREEN;
        else if (val === 'Unmatched') data.cell.styles.textColor = RED;
      }
    },
  });

  return doc.lastAutoTable?.finalY ?? y + 10;
}

// ── Receipt appendix ──────────────────────────────────────────────────────────

async function buildReceiptAppendix(doc, data, autoTable, onProgress) {
  const { expenses, documents, confirmedMatches, transactions } = data;
  const approvedWithDocs = expenses.filter((e) => e.status === 'approved' && e.documentId);

  if (approvedWithDocs.length === 0) return;

  doc.addPage();
  let y = MT;
  y = sectionHeading(doc, 'Source Documents', y);

  const docMap = {};
  for (const d of documents) docMap[d.id] = d;
  const matchMap = {};
  for (const m of confirmedMatches) matchMap[m.expenseId] = m;

  for (let i = 0; i < approvedWithDocs.length; i++) {
    const exp = approvedWithDocs[i];
    const docMeta = docMap[exp.documentId];
    const match = matchMap[exp.id];
    const matchedTxn = match ? transactions.find((t) => t.id === match.transactionId) : null;

    if (onProgress) {
      onProgress({ stage: 'receipts', current: i + 1, total: approvedWithDocs.length });
    }

    // Ensure enough space for the header block (at least 30mm)
    y = ensureSpace(doc, y, 30);

    // Expense header bar
    fillRect(doc, ML, y, CW, 7, BRAND_BLUE);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    setColor(doc, [255, 255, 255]);
    const headerLeft = `${exp.vendorName || '(unnamed)'} — ${fmtDate(exp.documentDate)}`;
    const headerRight = fmtAmt(exp.grossAmount, exp.currency);
    txt(doc, headerLeft, ML + 2, y + 5);
    txt(doc, headerRight, ML + CW - 2, y + 5, { align: 'right' });
    y += 9;

    // Expense details (two-column layout)
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    setColor(doc, GRAY_700);

    const details = [
      ['Doc Number', exp.documentNumber || '—'],
      ['Doc Type', exp.documentType || '—'],
      ['Category', exp.category || '—'],
      ['Payment', fmtPayment(exp.paymentMethod)],
      ['Net', fmtAmt(exp.netAmount, exp.currency)],
      ['VAT', exp.vatRate > 0 ? `${exp.vatRate}% = ${fmtAmt(exp.vatAmount, exp.currency)}` : '—'],
      ['Notes', exp.notes || '—'],
    ];
    if (matchedTxn) {
      details.push(['CC Txn', `${fmtDate(matchedTxn.transactionDate)} · ${matchedTxn.description}`]);
    }

    const colW = CW / 2;
    for (let j = 0; j < details.length; j++) {
      const col = j % 2;
      const row = Math.floor(j / 2);
      if (col === 0) y = ensureSpace(doc, y, 5);
      const dx = ML + col * colW;
      const dy = y + row * 5 - (col === 0 ? 0 : 0);

      doc.setFont('helvetica', 'bold');
      setColor(doc, GRAY_400);
      txt(doc, details[j][0] + ': ', dx, dy + 5);

      doc.setFont('helvetica', 'normal');
      setColor(doc, BLACK);
      const labelWidth = doc.getTextWidth(details[j][0] + ': ');
      const valText = doc.splitTextToSize(details[j][1], colW - 4 - labelWidth);
      txt(doc, valText[0] ?? '', dx + labelWidth, dy + 5);
    }
    // Advance y by number of detail rows
    y += (Math.ceil(details.length / 2) + 1) * 5 + 2;

    // Receipt image
    if (docMeta) {
      const img = await loadReceiptImage(exp.documentId, docMeta.fileType);
      if (img) {
        // Maximum: full content width, up to 180mm tall
        const MAX_IMG_W = CW;
        const MAX_IMG_H = 180;
        const { wMm, hMm } = fitDimensions(img.pixW, img.pixH, MAX_IMG_W, MAX_IMG_H);

        // If image won't fit on current page, start new page
        if (y + hMm + 4 > MAX_Y) {
          doc.addPage();
          y = MT;
          // Repeat expense label on new page
          fillRect(doc, ML, y, CW, 6, GRAY_100);
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          setColor(doc, GRAY_700);
          txt(doc, `Continued: ${exp.vendorName || '(unnamed)'} — ${fmtDate(exp.documentDate)}`, ML + 2, y + 4.5);
          y += 8;
        }

        try {
          doc.addImage(img.dataUrl, img.format, ML, y, wMm, hMm, undefined, 'FAST');
        } catch {
          // Image failed to embed — add placeholder
          fillRect(doc, ML, y, wMm, Math.min(hMm, 20), GRAY_100);
          doc.setFontSize(7);
          setColor(doc, GRAY_400);
          txt(doc, '[Receipt image could not be embedded]', ML + 2, y + 7);
        }
        y += hMm + 4;
      } else {
        // No image available
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'italic');
        setColor(doc, GRAY_400);
        txt(doc, '(Receipt file not available)', ML, y);
        y += 6;
      }
    }

    // Divider between receipts
    y = ensureSpace(doc, y, 6);
    hRule(doc, y, GRAY_100);
    y += 5;
  }
}

// ── CC Transactions table ────────────────────────────────────────────────────

function buildTransactionsTable(doc, data, autoTable) {
  const { transactions, confirmedMatches } = data;
  const matchedTxnIds = new Set(confirmedMatches.map((m) => m.transactionId));

  doc.addPage();
  let y = MT;
  y = sectionHeading(doc, 'Credit Card Transactions', y);

  const rows = transactions.map((t) => [
    fmtDate(t.transactionDate),
    t.description ?? '',
    t.cardLastFour ? `****${t.cardLastFour}` : '',
    t.billedCurrency ?? '',
    Math.abs(t.billedAmount ?? 0).toFixed(2),
    matchedTxnIds.has(t.id) ? 'Matched' : (t.status === 'ignored' ? 'Ignored' : 'Unmatched'),
  ]);

  autoTable(doc, {
    head: [['Date', 'Description', 'Card', 'CCY', 'Amount', 'Status']],
    body: rows.length > 0 ? rows : [['', 'No transactions for this period', '', '', '', '']],
    startY: y,
    margin: { left: ML, right: MR },
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: GRAY_100 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 80 },
      2: { cellWidth: 18 },
      3: { cellWidth: 12 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const val = data.cell.text[0];
        if (val === 'Matched') data.cell.styles.textColor = GREEN;
        else if (val === 'Unmatched') data.cell.styles.textColor = RED;
      }
    },
  });
}

// ── Unmatched items ──────────────────────────────────────────────────────────

function buildUnmatchedSection(doc, data, autoTable) {
  const { unmatchedTxns, expensesWithoutCharge } = data;

  doc.addPage();
  let y = MT;

  // Missing receipts
  y = sectionHeading(doc, 'Missing Receipts — CC Transactions Without Expense', y);
  const missingRows = unmatchedTxns.map((t) => [
    fmtDate(t.transactionDate),
    t.description ?? '',
    t.cardLastFour ? `****${t.cardLastFour}` : '',
    t.billedCurrency ?? '',
    Math.abs(t.billedAmount ?? 0).toFixed(2),
  ]);
  autoTable(doc, {
    head: [['Date', 'Description', 'Card', 'CCY', 'Amount']],
    body: missingRows.length > 0 ? missingRows : [['', 'None — all transactions have receipts', '', '', '']],
    startY: y,
    margin: { left: ML, right: MR },
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: GRAY_100 },
  });

  y = doc.lastAutoTable?.finalY ?? y + 10;
  y += 10;
  y = ensureSpace(doc, y, 20);

  // CC expenses without charge
  y = sectionHeading(doc, 'CC Expenses Without Matching Transaction', y);
  const noChargeRows = expensesWithoutCharge.map((e) => [
    fmtDate(e.documentDate),
    e.vendorName ?? '',
    e.documentNumber ?? '',
    e.currency ?? '',
    (e.grossAmount ?? 0).toFixed(2),
  ]);
  autoTable(doc, {
    head: [['Date', 'Vendor', 'Doc No.', 'CCY', 'Gross']],
    body: noChargeRows.length > 0 ? noChargeRows : [['', 'None — all CC expenses are matched', '', '', '']],
    startY: y,
    margin: { left: ML, right: MR },
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [202, 138, 4], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: GRAY_100 },
  });
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * Generate and download a PDF report for the given period.
 *
 * @param {object} reportData - see reports page for shape
 * @param {(p: {stage:string, current?:number, total?:number}) => void} onProgress
 */
export async function exportToPDF(reportData, onProgress = () => {}) {
  // Dynamic imports — browser only
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  onProgress({ stage: 'init' });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Cover page ──
  onProgress({ stage: 'cover' });
  buildCoverPage(doc, reportData);

  // ── Expenses table ──
  onProgress({ stage: 'expenses' });
  await buildExpensesTable(doc, reportData, autoTable);

  // ── Receipt appendix ──
  onProgress({ stage: 'receipts', current: 0, total: 0 });
  await buildReceiptAppendix(doc, reportData, autoTable, onProgress);

  // ── CC Transactions ──
  onProgress({ stage: 'transactions' });
  buildTransactionsTable(doc, reportData, autoTable);

  // ── Unmatched ──
  onProgress({ stage: 'unmatched' });
  buildUnmatchedSection(doc, reportData, autoTable);

  // ── Footers ──
  onProgress({ stage: 'finalizing' });
  addFooter(doc, reportData.periodLabel);

  // ── Download ──
  onProgress({ stage: 'done' });
  doc.save(`financial-report-${reportData.period}.pdf`);
}
