/**
 * Document extraction orchestrator.
 *
 * Receipt / invoice path:
 *   Image (JPEG/PNG/WebP) → Tesseract.js OCR → receipt parser
 *   Digital PDF           → PDF.js text layer → receipt parser
 *   Scanned PDF           → PDF.js render → Tesseract.js OCR → receipt parser
 *
 * Statement path:
 *   Digital PDF           → PDF.js text layer → statement parser
 *   Scanned PDF           → PDF.js render → Tesseract.js OCR → statement parser
 *
 * All processing is local. No data leaves the browser.
 */

import { extractPDF, renderPDFPages } from './pdf-extractor';
import { ocrSource } from './image-ocr';
import { parseReceipt } from './receipt-parser';
import { parseStatement } from './statement-parser';
import { detectCountry } from '@/config/vat-config';

// ── Receipt / invoice ─────────────────────────────────────────────────────────

/**
 * Extract financial fields from a receipt or invoice.
 *
 * @param {File} file
 * @param {(p: {stage:string, detail:string, percent:number}) => void} onProgress
 * @returns {{ method, fullText, fields, validationIssues, extractedAt }}
 */
export async function extractReceipt(file, onProgress = () => { }) {
  const isImage = file.type.startsWith('image/');
  const isPDF = file.type === 'application/pdf';

  console.log('[Receipt Extraction] File received:', file.name, '|', file.type, '|', file.size, 'bytes');
  console.log('[extractReceipt] Starting extraction', {
    name: file.name,
    type: file.type,
    size: file.size,
    isImage,
    isPDF,
  });

  if (!isImage && !isPDF) {
    throw new Error(`Unsupported file type for extraction: ${file.type}`);
  }

  let fullText = '';
  let pages = [];
  let method = 'manual';
  let language = null;

  if (isImage) {
    console.log('[extractReceipt] Image file — running OCR directly');
    onProgress({ stage: 'ocr', detail: 'Running OCR on image', percent: 15 });

    try {
      console.log('[OCR] Started');
      const ocrResult = await ocrSource(file, (m) => {
        const pct = 15 + Math.round(m.progress * 65);
        onProgress({
          stage: 'ocr',
          detail: m.status,
          percent: pct
        });
      });

      fullText = ocrResult.text;
      language = ocrResult.language;
      console.log('[OCR] Completed — text length:', fullText.length);
      console.log('[extractReceipt] OCR complete', { textLength: fullText.length });
    } catch (ocrErr) {
      console.error('[extractReceipt] OCR failed:', ocrErr);
      throw ocrErr;
    }

    method = 'image_ocr';
    pages = [{ pageNum: 1, text: fullText, items: [] }];

  } else {
    // PDF — try text layer first
    console.log('[extractReceipt] PDF file — attempting text layer extraction');
    onProgress({ stage: 'pdf', detail: 'Reading PDF text layer', percent: 10 });

    let pdfResult;
    try {
      pdfResult = await extractPDF(file, (p) => {
        const pct = 10 + Math.round((p.page / Math.max(p.total, 1)) * 35);
        onProgress({ stage: 'pdf', detail: `Reading page ${p.page} of ${p.total}`, percent: pct });
      });
    } catch (pdfErr) {
      console.error('[extractReceipt] PDF.js extraction failed:', pdfErr);
      throw pdfErr;
    }

    const { pages: pdfPages, fullText: pdfText, isScanned, pageCount } = pdfResult;
    console.log('[extractReceipt] PDF text layer result', {
      pageCount,
      textLength: pdfText.length,
      isScanned,
      preview: pdfText.slice(0, 200),
    });

    if (!isScanned) {
      fullText = pdfText;
      pages = pdfPages;
      method = 'pdf_text';
      console.log('[extractReceipt] Using PDF text layer — text length:', fullText.length);
      onProgress({ stage: 'parsing', detail: 'Text layer extracted', percent: 55 });
    } else {
      // Scanned PDF — render pages then OCR each one
      console.log('[extractReceipt] PDF has no text layer (scanned) — falling back to OCR');
      onProgress({ stage: 'render', detail: 'Rendering scanned PDF pages', percent: 45 });

      let canvases;
      try {
        canvases = await renderPDFPages(file, (p) => {
          const pct = 45 + Math.round((p.page / Math.max(p.total, 1)) * 15);
          onProgress({ stage: 'render', detail: `Rendering page ${p.page} of ${p.total}`, percent: pct });
        });
      } catch (renderErr) {
        console.error('[extractReceipt] PDF page rendering failed:', renderErr);
        throw renderErr;
      }

      console.log('[extractReceipt] Rendered', canvases.length, 'pages — running OCR on each');
      const textParts = [];
      for (let i = 0; i < canvases.length; i++) {
        const pct = 60 + Math.round((i / canvases.length) * 25);
        onProgress({ stage: 'ocr', detail: `OCR page ${i + 1} of ${canvases.length}`, percent: pct });
        try {
          console.log(`[OCR] Started — page ${i + 1}`);
          const ocrResult = await ocrSource(canvases[i], (m) => {
            onProgress({
              stage: 'ocr',
              detail: m.status,
              percent: pct
            });
          });

          const t = ocrResult.text;

          // Keep the first detected language.
          // All pages should use the same document language.
          if (!language && ocrResult.language) {
            language = ocrResult.language;
          }

          console.log(
            `[OCR] Completed — page ${i + 1} text length: ${t.length}`
          );

          console.log(
            `[extractReceipt] OCR page ${i + 1} — text length: ${t.length}, language: ${ocrResult.language}`
          );

          textParts.push(t);

          pages.push({
            pageNum: i + 1,
            text: t,
            items: []
          });
        } catch (ocrPageErr) {
          console.error(`[extractReceipt] OCR failed on page ${i + 1}:`, ocrPageErr);
          textParts.push('');
          pages.push({ pageNum: i + 1, text: '', items: [] });
        }
      }

      fullText = textParts.join('\n\n');
      method = 'scanned_pdf_ocr';
      console.log('[extractReceipt] OCR complete — total text length:', fullText.length);
    }
  }

  onProgress({ stage: 'parsing', detail: 'Parsing fields', percent: 90 });
  console.log('[extractReceipt] Parsing text into fields...');

  let fields, validationIssues, moneyNeedsReview;
  try {
    ({ fields, validationIssues, moneyNeedsReview } = await parseReceipt(fullText, language, pages));
    const parsedSummary = Object.fromEntries(
      Object.entries(fields).map(([k, f]) => [k, { value: f.value, status: f.status }])
    );
    console.log('[Parser] Parsed fields:', parsedSummary);
    console.log('[Parser] Money check:', {
      moneyFound: !moneyNeedsReview,
      moneyNeedsReview,
    });
  } catch (parseErr) {
    console.error('[extractReceipt] Parser threw an error:', parseErr);
    throw parseErr;
  }

  const extractedFields = Object.entries(fields)
    .filter(([, f]) => f.status !== 'missing')
    .map(([k, f]) => `${k}=${f.value}`);

  console.log('[extractReceipt] Parsing complete', {
    method,
    textLength: fullText.length,
    fieldsFound: extractedFields,
    validationIssues: validationIssues.length > 0 ? validationIssues : 'none',
  });

  onProgress({ stage: 'done', detail: 'Extraction complete', percent: 100 });

  return {
    method,
    fullText,
    fields,
    validationIssues,
    extractedAt: new Date().toISOString(),
  };
}

// ── CC statement ──────────────────────────────────────────────────────────────

/**
 * Extract transactions from a credit-card statement PDF.
 *
 * @param {File} file
 * @param {(p: {stage:string, detail:string, percent:number}) => void} onProgress
 * @returns {{ method, transactions, confidence, extractedText, issues }}
 */
export async function extractStatement(file, onProgress = () => { }) {
  if (file.type !== 'application/pdf') {
    throw new Error('Statement extraction requires a PDF file');
  }

  console.log('[extractStatement] Starting statement extraction', { name: file.name, size: file.size });
  onProgress({ stage: 'pdf', detail: 'Reading PDF', percent: 10 });

  const { pages, fullText, isScanned } = await extractPDF(file, (p) => {
    const pct = 10 + Math.round((p.page / Math.max(p.total, 1)) * 40);
    onProgress({ stage: 'pdf', detail: `Reading page ${p.page} of ${p.total}`, percent: pct });
  });

  console.log('[extractStatement] PDF read', { textLength: fullText.length, isScanned });

  let method = 'pdf_text';
  let textForParsing = fullText;
  let pagesForParsing = pages;

  if (isScanned) {
    console.log('[extractStatement] Scanned PDF — falling back to OCR');
    onProgress({ stage: 'render', detail: 'Rendering scanned PDF pages', percent: 50 });
    const canvases = await renderPDFPages(file, (p) => {
      const pct = 50 + Math.round((p.page / Math.max(p.total, 1)) * 20);
      onProgress({ stage: 'render', detail: `Rendering page ${p.page}`, percent: pct });
    });

    const textParts = [];
    pagesForParsing = [];
    for (let i = 0; i < canvases.length; i++) {
      const pct = 70 + Math.round((i / canvases.length) * 15);
      onProgress({ stage: 'ocr', detail: `OCR page ${i + 1} of ${canvases.length}`, percent: pct });
      const t = await ocrSource(canvases[i], () => { });
      textParts.push(t);
      pagesForParsing.push({ pageNum: i + 1, text: t, items: [] });
    }
    textForParsing = textParts.join('\n\n');
    method = 'scanned_pdf_ocr';
    console.log('[extractStatement] OCR complete — text length:', textForParsing.length);
  }

  const country = detectCountry(textForParsing);

  onProgress({
    stage: 'parsing',
    detail: 'Detecting transactions',
    percent: 88
  });

  const result = parseStatement(
    textForParsing,
    pagesForParsing,
    country
  );

  console.log('[extractStatement] Parsing complete', {
    transactions: result.transactions?.length ?? 0,
    confidence: result.confidence,
  });

  onProgress({
    stage: 'done',
    detail: result.transactions.length > 0
      ? `Found ${result.transactions.length} transactions`
      : 'No transactions detected automatically',
    percent: 100,
  });

  return { method, ...result };
}
