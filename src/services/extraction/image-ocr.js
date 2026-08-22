/**
 * OCR using Tesseract.js.
 *
 * Supports File, Blob, HTMLCanvasElement, data URL, or image URL.
 * Languages: English + Hebrew (common on Israeli financial documents).
 *
 * NOTE: Tesseract.js downloads its WASM core (~8 MB) and language trained-data
 * files (~4 MB for eng+heb) from jsDelivr CDN on first use. The browser caches
 * these files; subsequent runs are fully offline.
 */

const LANGS = 'eng+heb+swe';

function detectLanguage(text) {
  const scores = {
    sv: 0,
    en: 0,
    he: 0,
    de: 0,
    fr: 0,
    es: 0,
  };

  const lower = text.toLowerCase();

  // Swedish
  if (/\b(kvitto|att betala|varav moms|total pris|pris|referens|telefon|kontrollnummer)\b/i.test(lower)) {
    scores.sv += 5;
  }

  // English
  if (/\b(receipt|total|subtotal|tax|sales tax|amount due|invoice|payment)\b/i.test(lower)) {
    scores.en += 5;
  }

  // Hebrew
  if (/[\u0590-\u05FF]/.test(text)) {
    scores.he += 5;
  }

  // German
  if (/\b(rechnung|quittung|gesamt|mehrwertsteuer|betrag|bezahlt)\b/i.test(lower)) {
    scores.de += 5;
  }

  // French
  if (/\b(reçu|total|tva|montant|paiement|facture)\b/i.test(lower)) {
    scores.fr += 5;
  }

  // Spanish
  if (/\b(recibo|total|iva|importe|pago|factura)\b/i.test(lower)) {
    scores.es += 5;
  }

  const [language, score] = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0];

  return score > 0 ? language : null;
}

async function preprocessImage(source) {
  const image = new Image();
  const url = URL.createObjectURL(source);

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Don't make the image absurdly large.
    const scale = 2;

    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    ctx.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const imageData = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    const data = imageData.data;

    // Grayscale + moderate contrast.
    // Keep the image continuous instead of hard thresholding it.
    const contrast = 1.5;
    const midpoint = 128;

    for (let i = 0; i < data.length; i += 4) {
      const gray =
        0.299 * data[i] +
        0.587 * data[i + 1] +
        0.114 * data[i + 2];

      let value = midpoint + contrast * (gray - midpoint);

      value = Math.max(0, Math.min(255, value));

      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      // Keep alpha unchanged.
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Run OCR on source.
 *
 * @param {File|Blob|HTMLCanvasElement|string} source
 * @param {(m: {status:string, progress:number}) => void} onProgress
 * @returns {Promise<string>} extracted text
 */
export async function ocrSource(source, onProgress = () => {}) {
  if (typeof window === 'undefined') {
    throw new Error('OCR requires a browser environment');
  }

  const { createWorker, PSM } = await import('tesseract.js');

  const worker = await createWorker(LANGS, 1, {
    logger: (m) => {
      const pct =
        typeof m.progress === 'number'
          ? m.progress
          : 0;

      onProgress({
        status: m.status ?? 'Working',
        progress: pct,
      });
    },
  });

  try {
    // ============================================================
    // FIRST OCR PASS — normal receipt
    // ============================================================

    const result = await worker.recognize(source);

    let text = result?.data?.text ?? '';

    console.log('[OCR] Characters:', text.length);
    console.log('[OCR] Text:', text);

    // ============================================================
    // Detect suspicious monetary OCR
    // ============================================================

    const suspiciousOCR =
      /\b(?:SEK|kr)\s*\d+(?:[.,]\d+)?\s*%\s*\.?\d*/i.test(text);

    if (suspiciousOCR) {
      console.warn(
        '[OCR] Suspicious currency/amount recognition detected'
      );

      // ============================================================
      // SECOND OCR PASS
      //
      // Treat the image as a block of text instead of trying to
      // interpret the whole receipt layout.
      // ============================================================

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });

      const retry = await worker.recognize(source);

      const retryText = retry?.data?.text ?? '';

      console.log('[OCR RETRY] Text:', retryText);

      // Keep both results.
      text += '\n' + retryText;
    }

    const language = detectLanguage(text);

    console.log('[OCR] Detected language:', language);

    return {
      text,
      language,
      suspiciousOCR,
    };

  } finally {
    await worker.terminate().catch(() => {});
  }
}
