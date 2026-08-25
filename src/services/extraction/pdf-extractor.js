/**
 * PDF text extraction using PDF.js (pdfjs-dist).
 *
 * Two modes:
 *   Digital PDF  — extract existing text layer (fast, accurate)
 *   Scanned PDF  — render each page to canvas for OCR (slow)
 *
 * A page is considered "scanned" (text-less) when the extracted text
 * contains fewer than MIN_TEXT_CHARS characters.
 *
 * Safari compatibility:
 *   pdfjs-dist 6.x internally uses:
 *     • Promise.withResolvers()            — added Safari 17.4
 *     • ReadableStream[Symbol.asyncIterator] — added Safari 16.4
 *   Both APIs are polyfilled here before importing pdfjs-dist, and are
 *   also injected into the PDF.js web worker via a wrapper blob URL so
 *   that the worker environment is equally patched.
 *
 * Worker: /pdf.worker.min.mjs (copied to public/ by scripts/copy-workers.js)
 */

const MIN_TEXT_CHARS = 50;
const RENDER_SCALE = 2.0; // higher = better OCR quality, more memory

// ── Safari polyfills ──────────────────────────────────────────────────────────
// This code runs in BOTH the main thread (via applyMainThreadPolyfills) and
// the PDF.js web worker (injected as a string before importScripts).

/** Source text injected into the worker blob before importScripts. */
const _WORKER_POLYFILL_SRC = `
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    var resolve, reject;
    var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
    return { promise: promise, resolve: resolve, reject: reject };
  };
}
if (
  typeof ReadableStream !== 'undefined' &&
  typeof Symbol !== 'undefined' &&
  Symbol.asyncIterator &&
  !ReadableStream.prototype[Symbol.asyncIterator]
) {
  ReadableStream.prototype[Symbol.asyncIterator] = function () {
    var reader = this.getReader();
    return {
      next: function () { return reader.read(); },
      return: function (v) {
        reader.releaseLock();
        return Promise.resolve({ done: true, value: v });
      },
      [Symbol.asyncIterator]: function () { return this; }
    };
  };
}
if (typeof Map !== 'undefined' && typeof Map.prototype.getOrInsertComputed !== 'function') {
  Map.prototype.getOrInsertComputed = function (key, callbackfn) {
    if (this.has(key)) return this.get(key);
    var value = callbackfn(key);
    this.set(key, value);
    return value;
  };
}
`.trim();

/** Apply both polyfills in the current (main) thread. */
function applyMainThreadPolyfills() {
  if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function () {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }

  if (
    typeof ReadableStream !== 'undefined' &&
    typeof Symbol !== 'undefined' &&
    Symbol.asyncIterator &&
    !ReadableStream.prototype[Symbol.asyncIterator]
  ) {
    ReadableStream.prototype[Symbol.asyncIterator] = function () {
      const reader = this.getReader();
      return {
        next: () => reader.read(),
        return(v) {
          reader.releaseLock();
          return Promise.resolve({ done: true, value: v });
        },
        [Symbol.asyncIterator]() { return this; },
      };
    };
  }

  // pdfjs-dist 6.x uses Map.prototype.getOrInsertComputed (ECMAScript 2025).
  // Polyfill for browsers without it (Firefox, Safari, Chrome < 131, etc.)
  if (typeof Map !== 'undefined' && typeof Map.prototype.getOrInsertComputed !== 'function') {
    Map.prototype.getOrInsertComputed = function (key, callbackfn) {
      if (this.has(key)) return this.get(key);
      const value = callbackfn(key);
      this.set(key, value);
      return value;
    };
  }
}

// ── Lazy load pdfjs-dist (browser only) ──────────────────────────────────────

let _lib = null;
let _workerBlobUrl = null;

/**
 * Lazy-load PDF.js — browser only.
 * Polyfills are applied in both the main thread and the worker.
 */
async function getPdfjsLib() {
  if (_lib) return _lib;
  if (typeof window === 'undefined') throw new Error('PDF.js requires a browser environment');

  console.log('[PDF] Loading PDF.js');

  // Apply polyfills in the main thread BEFORE importing pdfjs-dist.
  // pdfjs-dist evaluates Promise.withResolvers() when its classes are
  // instantiated (class field initializers), so the polyfill must exist first.
  applyMainThreadPolyfills();

  const mod = await import('pdfjs-dist');

  // pdfjs-dist 6.x always creates workers with { type: "module" }, so the
  // workerSrc must be an ES module. Our blob injects polyfills then uses
  // "await import(url)" — valid ES module top-level syntax — to load the
  // real worker. Using importScripts() here would fail because that API
  // only exists in classic (non-module) workers.
  if (!_workerBlobUrl) {
    const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
    const blob = new Blob(
      [_WORKER_POLYFILL_SRC + `\nawait import(${JSON.stringify(workerSrc)});`],
      { type: 'application/javascript' },
    );
    _workerBlobUrl = URL.createObjectURL(blob);
  }
  mod.GlobalWorkerOptions.workerSrc = _workerBlobUrl;

  console.log('[PDF] Worker configured');

  _lib = mod;
  return mod;
}

// ── PDF loading ───────────────────────────────────────────────────────────────

/**
 * Load a PDF document from File, Blob, or ArrayBuffer.
 * Always converts to Uint8Array first (avoids browser stream APIs during load).
 * disableStream + disableAutoFetch: do not attempt range-requests or streaming,
 * which sidesteps Safari quirks with Response.body ReadableStreams.
 */
async function loadPdfDoc(source) {
  const lib = await getPdfjsLib();
  const buf = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const data = new Uint8Array(buf);
  const doc = await lib.getDocument({ data, disableStream: true, disableAutoFetch: true }).promise;
  console.log('[PDF] Document loaded —', doc.numPages, 'page(s)');
  return doc;
}

// ── Page text extraction ──────────────────────────────────────────────────────

/**
 * Extract text items from a single PDF page.
 * y-coordinates are flipped to top-down (0 = top of page).
 *
 * Uses page.streamTextContent() + reader.read() loop instead of the higher-
 * level page.getTextContent(), because getTextContent() internally iterates
 * a ReadableStream with `for await...of` — which requires
 * ReadableStream[Symbol.asyncIterator] and fails in Safari < 16.4 even when
 * the polyfill above is in place (the pdfjs-dist source is already compiled).
 * Reading via reader.read() is universally supported.
 */
async function extractPageText(page) {
  const stream = page.streamTextContent();
  const reader = stream.getReader();

  const allItems = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.items) {
        for (const item of value.items) allItems.push(item);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;

  const items = allItems
    .filter((item) => typeof item.str === 'string' && item.str.trim().length > 0)
    .map((item) => {
      const [, , , , x, y] = item.transform;
      return {
        str: item.str,
        x: Math.round(x),
        y: Math.round(pageHeight - y), // top-down
        width: Math.round(item.width),
        height: Math.round(item.height ?? 12),
      };
    });

  const text = items.map((i) => i.str).join(' ');
  return { text, items, hasText: text.trim().length >= MIN_TEXT_CHARS };
}

/** Render a page to an HTMLCanvasElement for OCR. */
async function renderPageToCanvas(page) {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * Extract text from all pages of a PDF.
 *
 * @param {File|Blob|ArrayBuffer} source
 * @param {(p: {stage:string, page:number, total:number}) => void} onProgress
 * @returns {{ pages, fullText, isScanned, pageCount }}
 */
export async function extractPDF(source, onProgress = () => {}) {
  const pdfDoc = await loadPdfDoc(source);
  const pageCount = pdfDoc.numPages;
  const pages = [];

  onProgress({ stage: 'reading', page: 0, total: pageCount });

  for (let i = 1; i <= pageCount; i++) {
    onProgress({ stage: 'reading', page: i, total: pageCount });
    const page = await pdfDoc.getPage(i);
    const { text, items, hasText } = await extractPageText(page);
    pages.push({ pageNum: i, text, items, hasText });
  }

  const fullText = pages.map((p) => p.text).join('\n\n');
  const isScanned = pages.every((p) => !p.hasText);

  console.log('[PDF] Embedded text length:', fullText.length);
  console.log('[PDF] Using OCR fallback:', isScanned);

  return { pages, fullText, isScanned, pageCount };
}

/**
 * Render all pages of a PDF to canvas elements.
 * Used when a PDF is scanned (no embedded text layer).
 *
 * @param {File|Blob|ArrayBuffer} source
 * @param {(p: {stage:string, page:number, total:number}) => void} onProgress
 * @returns {HTMLCanvasElement[]}
 */
export async function renderPDFPages(source, onProgress = () => {}) {
  const pdfDoc = await loadPdfDoc(source);
  const pageCount = pdfDoc.numPages;
  const canvases = [];

  for (let i = 1; i <= pageCount; i++) {
    onProgress({ stage: 'rendering', page: i, total: pageCount });
    const page = await pdfDoc.getPage(i);
    const canvas = await renderPageToCanvas(page);
    canvases.push(canvas);
  }

  return canvases;
}
