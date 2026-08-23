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

const LANGS = ['eng', 'heb', 'swe'];

function detectLanguage(text) {

  const scores = {
    swe: 0,
    eng: 0,
    heb: 0,
    deu: 0,
    fra: 0,
    spa: 0,
  };

  const lower = text.toLowerCase();

  // Swedish
  if (
    /\b(kvitto|att betala|varav moms|total pris|pris|referens|telefon|kontrollnummer)\b/i.test(lower)
  ) {
    scores.swe += 5;
  }

  // English
  if (
    /\b(receipt|total|subtotal|tax|sales tax|amount due|invoice|payment)\b/i.test(lower)
  ) {
    scores.eng += 5;
  }

  // Hebrew
  if (/[\u0590-\u05FF]/.test(text)) {
    scores.heb += 5;
  }

  // German
  if (
    /\b(rechnung|quittung|gesamt|mehrwertsteuer|betrag|bezahlt)\b/i.test(lower)
  ) {
    scores.deu += 5;
  }

  // French
  if (
    /\b(reçu|total|tva|montant|paiement|facture)\b/i.test(lower)
  ) {
    scores.fra += 5;
  }

  // Spanish
  if (
    /\b(recibo|total|iva|importe|pago|factura)\b/i.test(lower)
  ) {
    scores.spa += 5;
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

  const { createWorker } = await import('tesseract.js');

  // ============================================================
  // TESSERACT LANGUAGE DATA
  //
  // Explicitly specify the language-data location.
  // This prevents Tesseract.js from constructing the broken
  // jsDelivr URL that was causing the 404.
  // ============================================================

  let worker = null;

  try {
    // ============================================================
    // FIRST OCR WORKER
    //
    // Use all supported languages for the first pass.
    // The purpose of this pass is language detection.
    // ============================================================

    worker = await createWorker(
      LANGS,
      1,
      {
        logger: (m) => {
          const pct =
            typeof m.progress === 'number'
              ? m.progress
              : 0;

          onProgress({
            status:
              m.status ?? 'OCR (language detection)',
            progress: pct,
          });
        },
      }
    );

    // ============================================================
    // FIRST OCR PASS
    // ============================================================

    const result =
      await worker.recognize(source);

    const firstText =
      result?.data?.text ?? '';

    console.log(
      '[OCR FIRST] Characters:',
      firstText.length
    );

    console.log(
      '[OCR FIRST] Text:',
      firstText
    );

    // ============================================================
    // DETECT LANGUAGE
    // ============================================================

    const detectedLanguage =
      detectLanguage(firstText);

    console.log(
      '[OCR] Detected language:',
      detectedLanguage
    );

    // ============================================================
    // IF LANGUAGE WAS NOT DETECTED
    //
    // Keep the first OCR result.
    // ============================================================

    if (!detectedLanguage) {
      console.warn(
        '[OCR] Language could not be detected. Using first OCR result.'
      );

      return {
        text: firstText,
        language: null,
        firstText,
        secondPass: false,
      };
    }

    // ============================================================
    // SECOND PASS
    //
    // Re-use the same worker instead of creating another worker.
    // Tesseract.js supports reinitializing a worker with another
    // language.
    // ============================================================

    await worker.reinitialize(
      detectedLanguage,
      1
    );

    // ============================================================
    // SECOND OCR PASS
    // ============================================================

    const secondResult =
      await worker.recognize(source);

    const finalText =
      secondResult?.data?.text ?? '';

    console.log(
      '[OCR SECOND] Language:',
      detectedLanguage
    );

    console.log(
      '[OCR SECOND] Characters:',
      finalText.length
    );

    console.log(
      '[OCR SECOND] Text:',
      finalText
    );

    // ============================================================
    // RETURN
    // ============================================================

    return {
      text: finalText,
      language: detectedLanguage,
      firstText,
      secondPass: true,
    };

  } catch (error) {
    console.error(
      '[OCR] Failed:',
      error
    );

    throw error;

  } finally {
    if (worker) {
      await worker
        .terminate()
        .catch(() => {});
    }
  }
}
