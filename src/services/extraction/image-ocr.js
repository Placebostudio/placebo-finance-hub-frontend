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

const LANGS = 'eng+heb';

/**
 * Run OCR on source.
 *
 * @param {File|Blob|HTMLCanvasElement|string} source
 * @param {(m: {status:string, progress:number}) => void} onProgress
 * @returns {Promise<string>} extracted text
 */
export async function ocrSource(source, onProgress = () => {}) {
  if (typeof window === 'undefined') throw new Error('OCR requires a browser environment');

  // Dynamic import — keeps tesseract.js out of SSR bundle
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker(LANGS, 1, {
    logger: (m) => {
      const pct = typeof m.progress === 'number' ? m.progress : 0;
      if (m.status === 'recognizing text') {
        onProgress({ status: 'Recognizing text', progress: pct });
      } else if (m.status === 'loading tesseract core') {
        onProgress({ status: 'Loading OCR engine', progress: pct });
      } else if (m.status === 'loading language traineddata') {
        onProgress({ status: 'Loading language data', progress: pct });
      } else {
        onProgress({ status: m.status ?? 'Working', progress: pct });
      }
    },
  });

  try {
    const { data: { text } } = await worker.recognize(source);
    console.log(text);
    return text ?? '';
  } finally {
    await worker.terminate().catch(() => {});
  }
}
