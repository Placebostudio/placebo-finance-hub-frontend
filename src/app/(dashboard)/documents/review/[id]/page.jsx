"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  CheckCircle2, XCircle, Save, FileText, ChevronLeft,
  AlertTriangle, Info, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { documentService } from "@/services/document.service";
import { expenseService } from "@/services/expense.service";
import { APP_CONFIG } from "@/config";
import { calculateFromGross } from "@/lib/utils";
import { getCountryVatRate, COUNTRY_NAMES } from "@/config/vat-config";
import { toast } from "sonner";
import Link from "next/link";

import { documentRepository } from "@/services/backend-documents";
import { documentExtractionRepository } from "@/services/backend-document_extractions";
import { expenseRepository } from "@/services/backend-expenses";
import { categoryRepository } from "@/services/backend-categories";
import { currencyRepository } from "@/services/backend-currencies";
import { auditRepository } from "@/services/backend-audits";

// Reverse lookup: lowercase country name → ISO code
// e.g. "israel" → "IL", "germany" → "DE"
const _NAME_TO_CODE = Object.fromEntries(
  Object.entries(COUNTRY_NAMES).map(([code, name]) => [name.toLowerCase(), code])
);

function countryNameToCode(name) {
  if (!name) return null;
  return _NAME_TO_CODE[name.trim().toLowerCase()] ?? null;
}

const EMPTY_FORM = {
  vendorName: "",
  documentType: "receipt",
  documentNumber: "",
  documentDate: "",
  dueDate: "",

  currency: "ILS",
  country: "",

  grossAmount: "",
  vatRate: "",
  netAmount: "",
  vatAmount: "",

  category_id: "",

  paymentMethod: "unknown",

  notes: "",
};

/** Map field status → badge appearance */
const FIELD_STATUS_BADGE = {
  found: { label: "Extracted", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  review: { label: "Auto-detect", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  missing: { label: "Missing", className: "bg-muted text-muted-foreground" },
  invalid: { label: "Invalid", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

/** Method → human label */
const METHOD_LABELS = {
  pdf_text: "Digital PDF",
  image_ocr: "Image OCR",
  scanned_pdf_ocr: "Scanned PDF (OCR)",
  manual: "Manual entry",
};

function formatDateForInput(value) {
  if (!value) return "";

  // Already in yyyy-MM-dd format
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().split("T")[0];
}

function toDateInputValue(value) {
  if (!value) return "";

  return String(value).split("T")[0];
}

function FieldStatusBadge({ status }) {
  if (!status || status === "missing") return null;
  const cfg = FIELD_STATUS_BADGE[status] ?? FIELD_STATUS_BADGE.review;
  return (
    <span className={`ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function Field({ label, fieldKey, extractedField, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {extractedField && <FieldStatusBadge status={extractedField.status} />}
      </Label>
      {children}
      {extractedField?.sourceText && extractedField.status !== "missing" && (
        <p className="text-[10px] text-muted-foreground/70 truncate" title={extractedField.sourceText}>
          Source: {extractedField.sourceText}
        </p>
      )}
    </div>
  );
}

/** Build initial form values from extraction result fields */
function formFromExtraction(fields, categories = []) {
  if (!fields) return EMPTY_FORM;

  const f = fields;

  const country =
    f.country?.countryName ??
    f.country?.value ??
    "";

  const countryCode =
    f.country?.value ??
    countryNameToCode(country);

  const extractedVatRate =
    f.vatRate?.value != null &&
      f.vatRate.status !== "missing"
      ? f.vatRate.value
      : null;

  const countryVatRate =
    countryCode
      ? getCountryVatRate(countryCode)
      : null;

  // Priority:
  // 1. VAT rate extracted from document
  // 2. Default VAT rate for detected country
  // 3. Empty

  const vatRate =
    extractedVatRate != null
      ? String(extractedVatRate)
      : countryVatRate != null
        ? String(countryVatRate)
        : "";

  const defaultCategoryId =
    categories.find(
      (category) => category.name === "Other"
    )?.id ?? "";

  return {
    vendorName: f.vendorName?.value ?? "",

    documentType:
      f.documentType?.value ?? "receipt",

    documentNumber:
      f.documentNumber?.value ?? "",

    documentDate:
      toDateInputValue(f.documentDate?.value),

    dueDate:
      toDateInputValue(f.dueDate?.value),

    currency:
      f.currency?.value ?? "ILS",

    country,

    grossAmount:
      f.grossAmount?.value != null
        ? String(f.grossAmount.value)
        : "",

    // Extracted VAT rate first, otherwise country default
    vatRate,

    netAmount:
      f.netAmount?.value != null
        ? String(f.netAmount.value)
        : "",

    vatAmount:
      f.vatAmount?.value != null
        ? String(f.vatAmount.value)
        : "",

    // Actual category FK used by expenses
    category_id: defaultCategoryId,

    paymentMethod: "unknown",

    notes: "",
  };
}

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const [doc, setDoc] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [categories, setCategories] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [fxRateToSek, setFxRateToSek] = useState(1);
  const [extraction, setExtraction] = useState(null);

  // Track whether the user has explicitly typed a VAT rate so we don't overwrite it
  const vatManuallySet = useRef(false);
  // Track whether the country was just set from extraction (not a user change)
  const countryFromExtraction = useRef(false);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;

      try {
        // ============================================================
        // LOAD REQUIRED DATA
        // ============================================================

        const [d, categoryData, currencies] = await Promise.all([
          documentRepository.getById(id),

          categoryRepository.getAll({
            is_active: true,
            spam: false,
          }),

          currencyRepository.getAll(),
        ]);

        if (!d) {
          setNotFound(true);
          return;
        }

        setDoc(d);
        setCategories(categoryData);
        setCurrencies(currencies);

        // ============================================================
        // FIRST: CHECK FOR EXISTING EXPENSE
        // ============================================================

        let expense = null;

        try {
          expense = await expenseRepository.getByDocumentId(id);
        } catch (error) {
          if (error?.response?.status !== 404) {
            throw error;
          }
        }

        // ============================================================
        // EXPENSE EXISTS
        // ============================================================

        if (expense) {
          setExtraction(null);

          countryFromExtraction.current = false;
          vatManuallySet.current = true;

          setForm({
            vendorName: expense.vendor_name ?? "",
            documentType: expense.document_type ?? "receipt",
            documentNumber: expense.document_number ?? "",
            documentDate: toDateInputValue(expense.document_date),
            dueDate: toDateInputValue(expense.due_date),
            currency: expense.currency ?? "ILS",

            country: expense.country_code
              ? COUNTRY_NAMES[expense.country_code] ??
              expense.country_code
              : "",

            grossAmount:
              expense.gross_amount != null
                ? String(expense.gross_amount)
                : "",

            netAmount:
              expense.net_amount != null
                ? String(expense.net_amount)
                : "",

            vatAmount:
              expense.vat_amount != null
                ? String(expense.vat_amount)
                : "",

            vatRate:
              expense.vat_rate != null
                ? String(expense.vat_rate)
                : expense.country_code
                  ? (() => {
                    const rate = getCountryVatRate(
                      expense.country_code
                    );

                    return rate != null
                      ? String(rate)
                      : "";
                  })()
                  : "",

            category_id: expense.category_id ?? "",
            paymentMethod: expense.payment_method ?? "unknown",
            notes: expense.notes ?? "",
          });

          // ============================================================
          // NO EXPENSE
          // → CHECK DOCUMENT EXTRACTION
          // ============================================================

        } else {
          let extractionData = null;

          try {
            extractionData =
              await documentExtractionRepository.getById(id);
          } catch (error) {
            if (error?.response?.status !== 404) {
              throw error;
            }
          }

          setExtraction(extractionData);

          if (extractionData?.fields) {
            countryFromExtraction.current = true;
            vatManuallySet.current = false;

            setForm(
              formFromExtraction(
                extractionData.fields,
                categoryData
              )
            );
          }
        }

        // ============================================================
        // DOCUMENT FILE
        // ============================================================

        if (d.storage_path) {
          const fileUrl = await documentRepository.getFileUrl(id);
          setFileUrl(fileUrl);
        }

      } catch (err) {
        console.error(
          "Failed to load document data:",
          err
        );

        toast.error(
          err.message ||
          "Failed to load document"
        );
      }
    }

    fetchData();
  }, [id]);

  // When Country changes (from any source), look up the standard VAT rate and apply
  // it — unless the user has already manually overridden the VAT Rate field.
  useEffect(() => {
    if (countryFromExtraction.current) {
      // This update came from loading extraction data — reset flag but don't
      // treat the immediately-loaded vatRate as a manual override.
      countryFromExtraction.current = false;
      vatManuallySet.current = false;
      return;
    }

    if (vatManuallySet.current) return;

    const code = countryNameToCode(form.country);
    if (!code) return;

    const rate = getCountryVatRate(code);
    if (rate == null) return; // country has no VAT (e.g. US, CA) — leave field alone

    const rateStr = String(rate);
    setForm((f) => {
      if (f.vatRate === rateStr) return f; // already correct, avoid re-render
      const gross = parseFloat(f.grossAmount);
      if (!isNaN(gross) && gross > 0) {
        const { netAmount, vatAmount } = calculateFromGross(gross, rate);
        return { ...f, vatRate: rateStr, netAmount: String(netAmount), vatAmount: String(vatAmount) };
      }
      return { ...f, vatRate: rateStr };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.country]);

  useEffect(() => {
    if (!form.currency || !currencies?.length) return;

    const selectedCurrency = currencies.find(
      (currency) => currency.quote === form.currency
    );

    const sekCurrency = currencies.find(
      (currency) => currency.quote === "SEK"
    );

    if (!selectedCurrency || !sekCurrency) {
      setFxRateToSek(null);
      return;
    }

    if (form.currency === "SEK") {
      setFxRateToSek(1);
      return;
    }

    const rateToSek =
      sekCurrency.rate / selectedCurrency.rate;

    setFxRateToSek(rateToSek);
  }, [form.currency, currencies]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));


  /**
   * Recalculate net amount and VAT amount from gross + VAT rate.
   * net = gross / (1 + rate/100)   — because gross already includes VAT
   * vatAmount = gross − net
   */
  const recalcFromGross = useCallback((grossStr, rateStr) => {
    const gross = parseFloat(grossStr);
    const rate = parseFloat(rateStr);
    if (isNaN(gross) || gross <= 0 || isNaN(rate) || rate < 0) return;
    const { netAmount, vatAmount } = calculateFromGross(gross, rate);
    setForm((f) => ({
      ...f,
      netAmount: String(netAmount),
      vatAmount: String(vatAmount),
    }));
  }, []);

  if (!currencies || currencies.length === 0) {
    return;
  }

  const selectedCurrency = currencies.find(
    (c) => c.quote === form.currency
  );

  const sekCurrency = currencies.find(
    (c) => c.quote === "SEK"
  );

  if (!selectedCurrency) {
    throw new Error(`Currency ${form.currency} not found`);
  }

  if (!sekCurrency) {
    throw new Error("SEK exchange rate not found");
  }


  const save = async (status) => {
    setSaving(true);

    try {
      // ============================================================
      // COUNTRY
      // ============================================================

      const country_code =
        form.country
          ? Object.keys(COUNTRY_NAMES).find(
            (code) => COUNTRY_NAMES[code] === form.country
          ) ?? form.country
          : null;

      // ============================================================
      // VAT
      // ============================================================

      const vat_rate =
        form.vatRate !== ""
          ? parseFloat(form.vatRate)
          : getCountryVatRate(country_code);

      // ============================================================
      // AMOUNTS
      // ============================================================

      const gross_amount =
        form.grossAmount !== ""
          ? parseFloat(form.grossAmount)
          : null;

      const net_amount =
        form.netAmount !== ""
          ? parseFloat(form.netAmount)
          : null;

      const vat_amount =
        form.vatAmount !== ""
          ? parseFloat(form.vatAmount)
          : null;

      // New expenses start unpaid.
      const paid_amount = 0;

      // ============================================================
      // FX → SEK
      //
      // fxRateToSek is already calculated by the useEffect:
      //
      // EUR → SEK / EUR → selected currency
      //
      // SEK itself gives 1.
      // ============================================================

      if (fxRateToSek == null) {
        throw new Error(
          `Unable to determine FX rate for ${form.currency}`
        );
      }

      const roundMoney = (value) =>
        Math.round(value * 100) / 100;

      const gross_amount_sek =
        gross_amount != null
          ? roundMoney(gross_amount * fxRateToSek)
          : null;

      const paid_amount_sek =
        roundMoney(paid_amount * fxRateToSek);

      const vat_amount_sek =
        vat_amount != null
          ? roundMoney(vat_amount * fxRateToSek)
          : null;

      // ============================================================
      // EXPENSE DATA
      // ============================================================

      const expenseData = {
        document_id: id,

        vendor_name: form.vendorName,

        document_type: form.documentType,
        document_number: form.documentNumber || null,

        document_date: form.documentDate,
        due_date: form.dueDate || null,

        currency: form.currency,
        country_code,

        net_amount,
        vat_amount,
        vat_rate,
        gross_amount,

        paid_amount,

        // FX information
        fx_rate: fxRateToSek,
        fx_date:
          fxRateToSek != null
            ? new Date().toISOString().slice(0, 10)
            : null,
        fx_source:
          fxRateToSek != null
            ? "frankfurter"
            : null,

        // SEK values
        gross_amount_sek,
        paid_amount_sek,
        vat_amount_sek,

        category_id: form.category_id,

        payment_method: form.paymentMethod,

        notes: form.notes || null,

        status,
      };

      // ============================================================
      // DEBUG
      // ============================================================

      // console.log("Expense data:", expenseData);

      // console.table({
      //   vendor_name: expenseData.vendor_name,
      //   document_date: expenseData.document_date,
      //   currency: expenseData.currency,
      //   gross_amount: expenseData.gross_amount,
      //   fx_rate: expenseData.fx_rate,
      //   gross_amount_sek: expenseData.gross_amount_sek,
      //   paid_amount: expenseData.paid_amount,
      //   paid_amount_sek: expenseData.paid_amount_sek,
      //   vat_amount: expenseData.vat_amount,
      //   vat_amount_sek: expenseData.vat_amount_sek,
      //   category_id: expenseData.category_id,
      //   payment_method: expenseData.payment_method,
      // });

      // ============================================================
      // CHECK IF EXPENSE ALREADY EXISTS
      // ============================================================

      let existingExpense = null;

      try {
        existingExpense =
          await expenseRepository.getByDocumentId(id);
      } catch (error) {
        // 404 simply means there is no expense yet.
        if (error?.response?.status !== 404) {
          throw error;
        }
      }

      let expense;

      if (existingExpense) {
        // ==========================================================
        // EXISTING EXPENSE → UPDATE
        // ==========================================================

        expense =
          await expenseRepository.update(
            existingExpense.id,
            expenseData
          );
      } else {
        // ==========================================================
        // NO EXPENSE → CREATE
        // ==========================================================

        expense =
          await expenseRepository.create(
            expenseData
          );
      }

      // ============================================================
      // KEEP EXTRACTION STATE
      // ============================================================

      setExtraction(extraction);

      // ============================================================
      // APPROVING EXPENSE ALSO APPROVES DOCUMENT
      // ============================================================

      if (status === "approved") {
        await documentRepository.update(id, {
          status: "approved",
        });
      }

      // ============================================================
      // SUCCESS
      // ============================================================

      toast.success(
        status === "approved"
          ? "Expense approved and saved"
          : status === "rejected"
            ? "Expense rejected"
            : "Draft saved"
      );

      if (status !== "draft") {
        router.push("/documents/review");
      }

    } catch (err) {
      console.error(
        "Failed to save expense:",
        err
      );

      toast.error(
        err.message ||
        "Failed to save expense"
      );

    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground">Document not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/documents/review">Back to queue</Link>
        </Button>
      </div>
    );
  }

  if (!doc) return null;

  const ef = extraction?.fields ?? {};
  const hasExtraction = !!extraction;
  const validationIssues = extraction?.validationIssues ?? [];

  // Check whether net + vatAmount ≈ gross for live form values
  const liveGross = parseFloat(form.gross_amount) || 0;
  const liveNet = parseFloat(form.net_amount) || 0;
  const liveVat = parseFloat(form.vat_amount) || 0;
  const liveSum = Math.round((liveNet + liveVat) * 100) / 100;
  const liveAmountMismatch = liveGross > 0 && liveNet > 0 && liveVat > 0 &&
    Math.abs(liveSum - liveGross) > Math.max(0.05, liveGross * 0.005);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={doc.file_name}
        description={
          hasExtraction
            ? `Extracted via ${METHOD_LABELS[extraction.method] ?? extraction.method} — verify all values`
            : "Enter financial information from this document"
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/documents/review">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to queue
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-5xl">

          {/* LEFT: Preview + actions */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Document Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {fileUrl ? (
                  doc.file_type === "application/pdf" ? (
                    <iframe
                      src={fileUrl}
                      className="w-full rounded border"
                      style={{ height: 500 }}
                      title="Document preview"
                    />
                  ) : (
                    <img
                      src={fileUrl}
                      alt="Receipt"
                      className="w-full rounded border object-contain max-h-[500px]"
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center aspect-[3/4] rounded-lg bg-muted border-2 border-dashed">
                    <FileText className="h-16 w-16 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Loading preview…</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Extraction status */}
            {doc.extractionStatus === "failed" && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Automatic extraction failed for this file. Fill in the form manually.
                </AlertDescription>
              </Alert>
            )}
            {hasExtraction && validationIssues.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs space-y-1">
                  <p className="font-medium">Validation issues — please check these fields:</p>
                  {validationIssues.map((v, i) => (
                    <p key={i} className="text-muted-foreground">{v.issue}</p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            {liveAmountMismatch && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Net ({liveNet}) + VAT ({liveVat}) = {liveSum} ≠ Gross ({liveGross}) — values don&apos;t add up.
                </AlertDescription>
              </Alert>
            )}
            {hasExtraction && validationIssues.length === 0 && !liveAmountMismatch && (
              <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30">
                <Zap className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-xs text-blue-700 dark:text-blue-400">
                  Fields pre-filled from {METHOD_LABELS[extraction.method] ?? "extraction"}.
                  Review each value before approving.
                </AlertDescription>
              </Alert>
            )}
            {!hasExtraction && doc.extractionStatus !== "failed" && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Enter the financial information manually from the document on the left.
                </AlertDescription>
              </Alert>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => save("approved")} disabled={saving}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                Save Draft
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => save("rejected")}
                disabled={saving}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </div>
          </div>

          {/* RIGHT: Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                Financial Information
                {hasExtraction && (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    Pre-filled · verify all values
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Document section */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Document</p>
                <Field label="Vendor Name" fieldKey="vendorName" extractedField={ef.vendorName}>
                  <Input
                    value={form.vendorName}
                    onChange={(e) => set("vendorName", e.target.value)}
                    placeholder="e.g. Amazon, Adobe"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Document Type" fieldKey="documentType" extractedField={ef.documentType}>
                    <Select value={form.documentType} onValueChange={(v) => set("documentType", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {APP_CONFIG.documentTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Document Number" fieldKey="documentNumber" extractedField={ef.documentNumber}>
                    <Input
                      value={form.documentNumber}
                      onChange={(e) => set("documentNumber", e.target.value)}
                      placeholder="INV-001"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Document Date" fieldKey="documentDate" extractedField={ef.documentDate}>
                    <input
                      type="date"
                      value={formatDateForInput(form.documentDate)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          documentDate: e.target.value
                        })
                      }
                    />
                  </Field>
                  <Field label="Due Date" fieldKey="dueDate" extractedField={ef.dueDate}>
                    <input
                      type="date"
                      value={formatDateForInput(form.dueDate)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          dueDate: e.target.value
                        })
                      }
                    />
                  </Field>
                </div>
              </div>

              <Separator />

              {/* Amounts section */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Amounts</p>

                {/* Currency + Country */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Currency" fieldKey="currency" extractedField={ef.currency}>
                    <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {APP_CONFIG.supportedCurrencies.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Country" fieldKey="country" extractedField={ef.country}>
                    <Input
                      value={form.country}
                      onChange={(e) => set("country", e.target.value)}
                      placeholder="e.g. Israel"
                    />
                  </Field>
                </div>

                {/* VAT Rate — free text input, not a dropdown */}
                <Field label="VAT Rate (%)" fieldKey="vatRate" extractedField={ef.vatRate}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.vatRate}
                    onChange={(e) => {
                      vatManuallySet.current = true;
                      set("vatRate", e.target.value);
                      recalcFromGross(form.grossAmount, e.target.value);
                    }}
                    placeholder="e.g. 18"
                    className={ef.vatRate?.status === "invalid" ? "border-red-400" : ""}
                  />
                </Field>

                {/* Total Paid (Gross) — primary amount field */}
                <Field label="Total Paid (Gross)" fieldKey="grossAmount" extractedField={ef.grossAmount}>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.grossAmount}
                    onChange={(e) => {
                      set("grossAmount", e.target.value);
                      recalcFromGross(e.target.value, form.vatRate);
                    }}
                    placeholder="0.00"
                    className={ef.grossAmount?.status === "invalid" ? "border-red-400" : ""}
                  />
                </Field>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Enter the total amount paid (including VAT).
                  Net and VAT amount are calculated automatically when VAT rate is set.
                </p>

                {/* Net + VAT Amount — normally calculated outputs */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Net Amount" fieldKey="netAmount" extractedField={ef.netAmount}>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.netAmount}
                      onChange={(e) => set("netAmount", e.target.value)}
                      placeholder="0.00"
                      className={ef.netAmount?.status === "invalid" ? "border-red-400" : ""}
                    />
                  </Field>
                  <Field label="VAT Amount" fieldKey="vatAmount" extractedField={ef.vatAmount}>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.vatAmount}
                      onChange={(e) => set("vatAmount", e.target.value)}
                      placeholder="0.00"
                      className={ef.vatAmount?.status === "invalid" ? "border-red-400" : ""}
                    />
                  </Field>
                </div>
              </div>

              <Separator />

              {/* Classification */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Classification</p>
                <Field label="Category" fieldKey="category">
                  <Select
                    value={form.category_id}
                    onValueChange={(value) => set("category_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>

                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem
                          key={category.id}
                          value={category.id}
                        >
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Payment Method" fieldKey="paymentMethod">
                  <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APP_CONFIG.paymentMethods.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Separator />

              <Field label="Notes" fieldKey="notes">
                <Textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Optional notes…"
                  rows={3}
                />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
