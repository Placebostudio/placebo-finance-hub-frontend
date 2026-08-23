# Placebo Finance Hub

Financial document management and credit-card reconciliation — **frontend-only, local-first prototype**.

## What it does

Helps a company collect financial documents throughout the month and reconcile them against credit-card charges at end of month.

Core lifecycle:
```
UPLOAD → EXTRACT → REVIEW → RECORD → RECONCILE → REPORT
```

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.3.4 (App Router), React 19 |
| Language | JavaScript (JSX) — no TypeScript |
| Styling | Tailwind CSS + shadcn/ui (Radix UI) |
| State | Zustand (persistent auth session) |
| Forms | React Hook Form + Zod |
| Storage | localStorage (structured data) + IndexedDB (binary files) |
| PDF extraction | pdfjs-dist 6.x (text layer extraction + page rendering) |
| OCR | Tesseract.js 7.x (English + Hebrew, runs in browser) |
| CSV parsing | PapaParse |
| Excel export | SheetJS (xlsx 0.18.x) — client-side, no server required |
| PDF report | jsPDF 4.x + jspdf-autotable 5.x — client-side, embeds receipt images |
| Icons | Lucide React |
| Toasts | Sonner |

## Running locally

```bash
npm install       # also copies pdf.worker.min.mjs to public/
npm run dev       # http://localhost:3000
npm run build     # production build
```

**Demo credentials** (not production auth):
- Username: `Placeboadmin`
- Password: `Placebo2026`

## Architecture

```
React UI (Next.js App Router, all client components)
    ↓
Services (src/services/*.js)                 ← domain logic
    ├── extraction/                          ← PDF/OCR/parsing (NEW)
    │     document-extractor.js             ← orchestrator
    │     pdf-extractor.js                  ← PDF.js text + render
    │     image-ocr.js                      ← Tesseract.js OCR
    │     receipt-parser.js                 ← rules-based receipt parser
    │     statement-parser.js               ← rules-based CC statement parser
    └── (other services unchanged)
    ↓
Storage layer (src/storage/)                 ← persistence abstraction
    ↓
localStorage  (structured data + metadata)  ← survives page refresh
IndexedDB     (file blobs)                  ← survives page refresh
```

All processing is local. No backend, no network requests during extraction.

## Main routes

| Route | Purpose |
|---|---|
| `/dashboard` | Stats and action items |
| `/documents` | All uploaded documents |
| `/documents/upload` | Upload images/PDFs with auto-extraction |
| `/documents/review` | Review queue |
| `/documents/review/[id]` | Pre-filled expense form from extracted data |
| `/expenses` | Approved expense records |
| `/transactions` | Statements + CC transactions (manual / CSV / PDF import) |
| `/reconciliation` | Match expenses against transactions |
| `/reports` | Monthly summary + readiness status |
| `/vendors` | Vendor list and expense categories |
| `/users` | User management (admin only) |
| `/settings` | Company and accounting settings |

## Key workflows

### 1. Upload and record an expense

1. Go to **Documents → Upload**
2. Drag & drop or browse for image/PDF
3. File saved to IndexedDB, extraction starts automatically:
   - Digital PDF → PDF.js text layer extracted
   - JPEG/PNG/WebP → Tesseract.js OCR
   - Scanned PDF → PDF.js renders each page to canvas → Tesseract.js OCR per page
4. Upload card shows live stage: `Uploading → Reading PDF / Running OCR → Parsing fields → Ready for review`
5. On completion status is `ready_for_review`; on failure `failed` (document still usable)
6. Go to **Review Queue** → click **Review**
7. Document preview on left, form pre-filled with extracted values on right
8. Each field shows extraction confidence: **Extracted** (green) / **Review** (yellow) / **Invalid** (red)
9. Validation warnings shown for arithmetic mismatches (net + vat ≠ gross)
10. Correct any values, then click **Approve** → creates an Expense Record in localStorage
11. Appears in **Expenses** list

**Never auto-approved** — user must always click Approve.

### 2. Import credit-card statement from PDF

1. Go to **Transactions → Import PDF**
2. Drop a CC statement PDF
3. Click **Extract transactions**
4. Progress shown: `Reading PDF → Detecting transactions → N transactions found`
5. Editable preview table shows parsed rows
6. User can: edit any row, remove rows, add missing rows
7. Enter statement period (YYYY-MM), click **Confirm Import**
8. Transactions saved to localStorage and appear in the Transactions tab

If automatic parsing finds no rows: extracted text is shown for reference, user adds rows manually.

### 3. Import credit-card statement from CSV

1. Go to **Transactions → Import CSV**
2. Drop CSV file (PapaParse handles common bank header names)
3. Preview shown (first 5 rows)
4. Select statement, click **Import All**

### 4. Reconcile

1. Go to **Reconciliation**
2. **Suggestions** tab — deterministic matching algorithm suggests pairs
3. Review reasons (amount, date, vendor, currency)
4. **Confirm** or **Reject** each suggestion
5. **Missing Receipts** tab — CC transactions with no matched expense
6. **No Card Charge** tab — CC expenses with no transaction (cash/bank excluded)
7. Matches persist to localStorage; can be undone

### 5. Reporting and Export

1. Go to **Reports**, select month
2. See readiness status (green = all expenses approved, all CC transactions matched)
3. Click **Export Excel (.xlsx)** — downloads a 4-sheet workbook:
   - **Summary** — key metrics for the period
   - **Expenses** — all expense records with reconciliation status and matched transaction details
   - **CC Transactions** — all transactions with match status
   - **Reconciliation** — confirmed match pairs with scores and reasons
4. Click **Export PDF Report** — generates a multi-section PDF with progress indicator:
   - Cover page with period summary and readiness status
   - Expenses table
   - Receipt appendix: each approved expense with its original document image embedded
   - CC transactions table
   - Unmatched items (missing receipts + CC expenses without charge)

All export is client-side — no server, no upload.

## Extraction details

### Receipt / invoice extraction

| File type | Method | Notes |
|---|---|---|
| Digital PDF | PDF.js text layer | Fast, no OCR needed |
| Image (JPEG/PNG/WebP) | Tesseract.js OCR | English + Hebrew languages |
| Scanned PDF | PDF.js render → Tesseract.js | Slower; OCR engine downloaded on first use |

**Fields extracted (deterministic, no AI):**

| Field | Approach |
|---|---|
| vendorName | First meaningful non-keyword line |
| documentType | Keyword match (invoice/receipt/credit note) |
| documentNumber | Regex patterns (INV-xxx, #xxx, receipt no.) |
| documentDate | Label keywords + date pattern fallback |
| dueDate | "Due date / pay by" label pattern |
| currency | Symbol detection (₪ $ € £) + code pattern |
| vatRate | "VAT @ N%" / "N% VAT" patterns |
| grossAmount | Total / Grand Total / Amount Due labels |
| netAmount | Subtotal / Net Amount / Before Tax labels |
| vatAmount | VAT/GST amount label |

**Arithmetic validation:** `net + vat ≈ gross` and `net × vatRate ≈ vatAmount` (0.5% tolerance). Mismatches mark affected fields `invalid` and show a warning in the review form.

**Field states:** `found` · `review` · `missing` · `invalid`

**Extraction method stored with result** — visible in review page header.

### Statement / transaction extraction

Generic heuristic parser:
- Reconstructs table rows from PDF text item y-coordinates
- A "transaction row" must contain at least one date and one monetary amount
- Date formats handled: YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY, DD.MM.YYYY
- Amount formats: 1,234.56 (US) and 1.234,56 (European decimal comma)
- Currency: symbol detection (₪ $  € £) and code detection (ILS USD EUR GBP)
- Deduplication of identical rows that appear in statement totals

**No provider-specific parsers yet.** For bank statements with non-standard layouts, the parser may detect zero rows. In that case: extracted text is shown, user adds transactions manually.

**Transactions are never saved before user confirms** — the preview table is editable.

### Known extraction limitations

- **Tesseract.js WASM and trained-data files (~12 MB for eng+heb) are downloaded from jsDelivr CDN on first OCR use.** Subsequent runs use the browser cache.
- OCR accuracy depends on image quality; low-resolution or rotated scans may have poor results.
- The generic statement parser works best with simple single-table layouts. Multi-section statements, statements with images-only content, and password-protected PDFs are not supported.
- Hebrew RTL text OCR is supported but may require user review.
- No provider-specific statement parsers (American Express, Leumi, etc.) — only the generic heuristic is implemented.
- Vendor name extraction uses the first meaningful line heuristic; unusual invoice layouts may pick the wrong line.

## Domain model

```
Document          — uploaded file metadata
                    status: pending_review | approved | rejected
                    extractionStatus: uploaded | extracting | ready_for_review | failed
                    extractionResult: { method, fields, validationIssues, fullText, extractedAt }

ExpenseRecord     — financial info entered from document
                    status: draft | approved | rejected

Statement         — CC statement container
Transaction       — individual CC charge
                    status: unmatched | matched | suggested | ignored
Match             — confirmed link between ExpenseRecord and Transaction
```

Only expenses with `paymentMethod = credit_card` participate in reconciliation.
Cash and bank-transfer expenses are valid records but never appear as "missing receipt" in reconciliation.

## Matching algorithm

Deterministic, rule-based (no AI):

| Factor | Points |
|---|---|
| Exact amount | 40 |
| Near-exact amount (< 2%) | 30 |
| Same date | 30 |
| Date within 1 day | 22 |
| Vendor name match | up to 20 |
| Same currency | 5 |

Thresholds: ≥80 = Strong Candidate, ≥50 = Possible Candidate.
User must confirm every match — nothing is auto-confirmed.

## File storage

- **Receipt images and invoice PDFs** → IndexedDB (`files` store), keyed by document ID
- **Statement PDFs** → IndexedDB (`statement_files` store), keyed by statement ID
- **All metadata, records, extraction results** → localStorage with `pfh_` namespace

Extraction results (text + parsed fields) are stored in localStorage as part of the document record. Binary files are never duplicated to localStorage.

## Persistence keys (localStorage)

| Key | Content |
|---|---|
| `pfh_auth_session` | Logged-in user session |
| `pfh_documents` | Document metadata + extraction results |
| `pfh_expenses` | Expense records |
| `pfh_statements` | Statement metadata |
| `pfh_transactions` | CC transactions |
| `pfh_matches` | Confirmed/rejected matches |
| `pfh_vendors` | Vendor list |
| `pfh_categories` | Expense categories |
| `pfh_users` | Local users |
| `pfh_settings` | Company settings |

## Source structure

```
src/
  app/                            Next.js App Router pages
    (auth)/login/
    (dashboard)/
      dashboard/
      documents/
      documents/upload/           Upload + auto-extraction
      documents/review/
      documents/review/[id]/      Pre-filled expense review form
      expenses/
      transactions/               Statements + CSV + PDF import
      reconciliation/
      reports/
      vendors/
      users/
      settings/
  components/
    ui/                           shadcn/ui components (JSX)
    layout/                       Sidebar, PageHeader
    shared/                       ThemeProvider
  services/
    extraction/                   Local document extraction
      document-extractor.js       Orchestrator (receipt + statement paths)
      pdf-extractor.js            PDF.js text extraction + canvas rendering
      image-ocr.js                Tesseract.js OCR wrapper
      receipt-parser.js           Deterministic receipt/invoice field parser
      statement-parser.js         Deterministic CC statement transaction parser
    report/                       Client-side export
      excel-exporter.js           SheetJS workbook (4 sheets)
      pdf-reporter.js             jsPDF report with embedded receipt images
    document.service.js           Document CRUD + extraction status
    expense.service.js
    statement.service.js
    transaction.service.js
    reconciliation.service.js
    vendor.service.js
    user.service.js
    settings.service.js
  storage/
    db.js                         IndexedDB abstraction
    local-store.js                localStorage abstraction
  store/
    auth.js                       Zustand auth store
    app.js                        Zustand UI state
  hooks/
    use-auth-guard.js             Route protection
  lib/
    utils.js                      Shared utilities
  config/
    index.js                      App config and demo credentials
public/
  pdf.worker.min.mjs              PDF.js worker (copied by postinstall)
scripts/
  copy-workers.js                 Postinstall script — copies PDF.js worker
```

## Important notes

- **Not production auth** — users/passwords in localStorage plaintext. Replace before going live.
- **No backend** — all data is local. Adding a backend means replacing `src/services/*.js` and `src/storage/` without touching the UI.
- **No AI / LLM** — all extraction is deterministic (regex, keyword matching, arithmetic). No calls to Claude, OpenAI, or any external API.
- **Export is client-side** — Excel via SheetJS, PDF via jsPDF with embedded receipt images from IndexedDB.
- **OCR requires internet on first use** — Tesseract.js downloads its engine and trained-data from jsDelivr CDN on first OCR run (then cached).
sync test - 23/08/2026 - Erel