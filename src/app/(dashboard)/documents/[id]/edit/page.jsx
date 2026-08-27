"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import { useRouter, useParams } from "next/navigation";

import {
  Save,
  X,
  FileText,
  ChevronLeft,
  AlertTriangle,
  Info,
  Zap,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

import { PageHeader } from "@/components/layout/page-header";

import { documentService } from "@/services/document.service";
import { expenseService } from "@/services/expense.service";
import { reconciliationService } from "@/services/reconciliation.service";

import { APP_CONFIG } from "@/config";
import { calculateFromGross } from "@/lib/utils";

import {
  getCountryVatRate,
  COUNTRY_NAMES,
} from "@/config/vat-config";

import { toast } from "sonner";
import Link from "next/link";

import { documentRepository } from "@/services/backend-documents";
import { documentExtractionRepository } from "@/services/backend-document_extractions";
import { expenseRepository } from "@/services/backend-expenses";
import { categoryRepository } from "@/services/backend-categories";
import { currencyRepository } from "@/services/backend-currencies";

const EMPTY_FORM = {
  vendorName: "",
  documentType: "receipt",
  documentNumber: "",
  documentDate: "",
  dueDate: "",

  currency: "ILS",
  country: "",
  countryCode: "",

  grossAmount: "",
  vatRate: "",
  netAmount: "",
  vatAmount: "",

  category_id: "",
  paymentMethod: "unknown",

  notes: "",
};

const FIELD_STATUS_BADGE = {
  found: {
    label: "Extracted",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },

  review: {
    label: "Auto-detect",
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },

  missing: {
    label: "Missing",
    className:
      "bg-muted text-muted-foreground",
  },

  invalid: {
    label: "Invalid",
    className:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};


// Reverse lookup:
// "israel" -> "IL"
// "germany" -> "DE"
const NAME_TO_CODE = Object.fromEntries(
  Object.entries(COUNTRY_NAMES).map(
    ([code, name]) => [
      name.toLowerCase(),
      code,
    ]
  )
);

const METHOD_LABELS = {
  pdf_text: "Digital PDF",
  image_ocr: "Image OCR",
  scanned_pdf_ocr: "Scanned PDF (OCR)",
  manual: "Manual entry",
};

function FieldStatusBadge({ status }) {
  if (!status || status === "missing") {
    return null;
  }

  const cfg =
    FIELD_STATUS_BADGE[status] ??
    FIELD_STATUS_BADGE.review;

  return (
    <span
      className={`ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}


function Field({
  label,
  fieldKey,
  extractedField,
  children,
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        {label}

        {extractedField && (
          <FieldStatusBadge
            status={extractedField.status}
          />
        )}
      </Label>

      {children}

      {extractedField?.sourceText &&
        extractedField.status !== "missing" && (
          <p
            className="text-[10px] text-muted-foreground/70 truncate"
            title={extractedField.sourceText}
          >
            Source: {extractedField.sourceText}
          </p>
        )}
    </div>
  );
}


function formatDateForInput(value) {
  if (!value) {
    return "";
  }

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}


function formFromExpense(expense) {
  const countryCode =
    expense.country_code ?? "";

  const countryName =
    countryCode
      ? COUNTRY_NAMES[countryCode] ?? countryCode
      : expense.country ?? "";

  let vatRate = "";

  if (
    expense.vat_rate != null &&
    expense.vat_rate !== 0
  ) {
    vatRate = String(expense.vat_rate);
  } else if (countryCode) {
    const rate =
      getCountryVatRate(countryCode);

    if (rate != null) {
      vatRate = String(rate);
    }
  }

  return {
    vendorName:
      expense.vendor_name ?? "",

    documentType:
      expense.document_type ?? "receipt",

    documentNumber:
      expense.document_number ?? "",

    documentDate:
      formatDateForInput(
        expense.document_date
      ),

    dueDate:
      formatDateForInput(
        expense.due_date
      ),

    currency:
      expense.currency ?? "ILS",

    country:
      countryName,

    countryCode,

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

    vatRate,

    category_id:
      expense.category_id ?? "",

    paymentMethod:
      expense.payment_method ?? "unknown",

    notes:
      expense.notes ?? "",
  };
}


export default function EditDocumentPage() {
  const router = useRouter();
  const params = useParams();

  const docId = params?.id;

  const [doc, setDoc] = useState(null);

  const [expense, setExpense] = useState(null);

  const [fileUrl, setFileUrl] = useState(null);

  const [form, setForm] = useState(null);

  const [originalForm, setOriginalForm] =
    useState(null);

  const [saving, setSaving] = useState(false);

  const [notFound, setNotFound] =
    useState(false);

  const [reconWarning, setReconWarning] =
    useState(null);

  const [categories, setCategories] =
    useState([]);

  const [currencies, setCurrencies] =
    useState([]);

  const [fxRateToSek, setFxRateToSek] =
    useState(null);

  const [extraction, setExtraction] =
    useState(null);


  // Tracks whether VAT was manually changed.
  const vatManuallySet = useRef(false);


  // Tracks whether country came from extraction.
  const countryFromExtraction = useRef(false);

  useEffect(() => {
    if (!docId) return;

    async function load() {
      try {
        // ============================================================
        // LOAD DOCUMENT + CATEGORIES + CURRENCIES
        // ============================================================

        const [
          documentData,
          categoryData,
          currencyData,
        ] = await Promise.all([
          documentRepository.getById(docId),

          categoryRepository.getAll({
            is_active: true,
            spam: false,
          }),

          currencyRepository.getAll(),
        ]);

        if (!documentData) {
          setNotFound(true);
          return;
        }

        setDoc(documentData);
        setCategories(categoryData);
        setCurrencies(currencyData);

        // ============================================================
        // DOCUMENT FILE
        // ============================================================

        if (documentData.storage_path) {
          const url =
            await documentRepository.getFileUrl(
              docId
            );

          setFileUrl(url);
        }

        // ============================================================
        // EXISTING EXPENSE
        // ============================================================

        let existingExpense = null;

        try {
          existingExpense =
            await expenseRepository.getByDocumentId(
              docId
            );
        } catch (error) {
          if (
            error?.response?.status !== 404
          ) {
            throw error;
          }
        }

        if (existingExpense) {
          // ========================================================
          // EXISTING EXPENSE
          // ========================================================

          setExpense(existingExpense);

          setExtraction(null);

          countryFromExtraction.current = false;

          // Existing persisted VAT should not be
          // overwritten automatically.
          vatManuallySet.current = true;

          const initial =
            formFromExpense(
              existingExpense
            );

          setForm(initial);
          setOriginalForm(initial);

          return;
        }

        // ============================================================
        // NO EXPENSE
        // ============================================================
        //
        // This normally should not happen on the approved-edit page,
        // but we can still load extraction information so the page
        // has the same extraction-aware behavior.
        // ============================================================

        let extractionData = null;

        try {
          extractionData =
            await documentExtractionRepository.getById(
              docId
            );
        } catch (error) {
          if (
            error?.response?.status !== 404
          ) {
            throw error;
          }
        }

        setExtraction(extractionData);

        if (extractionData?.fields) {
          countryFromExtraction.current = true;
          vatManuallySet.current = false;

          // Use extraction values as a fallback.
          const fields =
            extractionData.fields;

          const country =
            fields.country?.countryName ??
            fields.country?.value ??
            "";

          const countryCode =
            fields.country?.value ??
            countryNameToCode(country);

          const extractedVatRate =
            fields.vatRate?.value != null
              ? fields.vatRate.value
              : null;

          const countryVatRate =
            countryCode
              ? getCountryVatRate(
                countryCode
              )
              : null;

          const vatRate =
            extractedVatRate != null
              ? String(extractedVatRate)
              : countryVatRate != null
                ? String(countryVatRate)
                : "";

          const defaultCategoryId =
            categoryData.find(
              (category) =>
                category.name === "Other"
            )?.id ?? "";

          const initial = {
            ...EMPTY_FORM,

            vendorName:
              fields.vendorName?.value ?? "",

            documentType:
              fields.documentType?.value ??
              "receipt",

            documentNumber:
              fields.documentNumber?.value ??
              "",

            documentDate:
              formatDateForInput(
                fields.documentDate?.value
              ),

            dueDate:
              formatDateForInput(
                fields.dueDate?.value
              ),

            currency:
              fields.currency?.value ?? "ILS",

            country,

            countryCode,

            grossAmount:
              fields.grossAmount?.value != null
                ? String(
                  fields.grossAmount.value
                )
                : "",

            netAmount:
              fields.netAmount?.value != null
                ? String(
                  fields.netAmount.value
                )
                : "",

            vatAmount:
              fields.vatAmount?.value != null
                ? String(
                  fields.vatAmount.value
                )
                : "",

            vatRate,

            category_id:
              defaultCategoryId,

            paymentMethod: "unknown",

            notes: "",
          };

          setForm(initial);
          setOriginalForm(initial);
        } else {
          const initial = {
            ...EMPTY_FORM,
          };

          setForm(initial);
          setOriginalForm(initial);
        }

      } catch (err) {
        console.error(
          "Failed to load document:",
          err
        );

        toast.error(
          err.message ||
          "Failed to load document"
        );

        setNotFound(true);
      }
    }

    load();
  }, [docId]);

  useEffect(() => {
    if (!form) return;

    // Extraction has already supplied the initial
    // VAT rate. Do not overwrite it immediately.
    if (countryFromExtraction.current) {
      countryFromExtraction.current = false;
      vatManuallySet.current = false;
      return;
    }

    // User manually entered a VAT rate.
    if (vatManuallySet.current) {
      return;
    }

    const countryCode =
      form.countryCode ||
      countryNameToCode(form.country);

    if (!countryCode) {
      return;
    }

    const rate =
      getCountryVatRate(countryCode);

    if (rate == null) {
      return;
    }

    const rateString =
      String(rate);

    setForm((current) => {
      if (!current) return current;

      const gross =
        parseFloat(
          current.grossAmount
        );

      if (
        !Number.isNaN(gross) &&
        gross > 0
      ) {
        const {
          netAmount,
          vatAmount,
        } = calculateFromGross(
          gross,
          rate
        );

        return {
          ...current,

          countryCode,

          vatRate: rateString,

          netAmount:
            String(netAmount),

          vatAmount:
            String(vatAmount),
        };
      }

      return {
        ...current,

        countryCode,

        vatRate: rateString,
      };
    });

  }, [form?.country, form?.countryCode]);

  useEffect(() => {
    if (
      !form?.currency ||
      !currencies?.length
    ) {
      return;
    }

    const selectedCurrency =
      currencies.find(
        (currency) =>
          currency.quote === form.currency
      );

    const sekCurrency =
      currencies.find(
        (currency) =>
          currency.quote === "SEK"
      );

    if (
      !selectedCurrency ||
      !sekCurrency
    ) {
      setFxRateToSek(null);
      return;
    }

    if (form.currency === "SEK") {
      setFxRateToSek(1);
      return;
    }

    // Example:
    //
    // EUR = 1
    // SEK = 11.0841
    //
    // EUR -> SEK:
    // 11.0841 / 1 = 11.0841
    //
    // USD = 1.1672
    //
    // USD -> SEK:
    // 11.0841 / 1.1672
    //
    const rateToSek =
      sekCurrency.rate /
      selectedCurrency.rate;

    setFxRateToSek(rateToSek);

  }, [form?.currency, currencies]);

  const recalcFromGross =
    useCallback(
      (grossStr, rateStr) => {
        const gross =
          parseFloat(grossStr);

        if (
          Number.isNaN(gross) ||
          gross <= 0
        ) {
          return;
        }

        // If VAT rate was removed,
        // clear calculated amounts.
        if (
          !rateStr ||
          rateStr === ""
        ) {
          setForm((current) => ({
            ...current,
            netAmount: "",
            vatAmount: "",
          }));

          return;
        }

        const rate =
          parseFloat(rateStr);

        if (
          Number.isNaN(rate) ||
          rate < 0
        ) {
          return;
        }

        const {
          netAmount,
          vatAmount,
        } = calculateFromGross(
          gross,
          rate
        );

        setForm((current) => ({
          ...current,

          netAmount:
            String(netAmount),

          vatAmount:
            String(vatAmount),
        }));
      },
      []
    );

  useEffect(() => {
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [fileUrl]);

  const set = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  /**
   * Auto-recalculate net + VAT amount when gross or VAT rate changes.
   * Clears net/vatAmount if rate is blank.
   */

  const handleCancel = () => {
    if (originalForm) {
      setForm(originalForm);
    }

    setReconWarning(null);

    router.push("/documents");
  };

  const handleSave = async () => {
    if (!expense || !form) {
      return;
    }

    setSaving(true);

    try {
      // ============================================================
      // COUNTRY
      // ============================================================

      const country_code =
        form.countryCode ||
        countryNameToCode(
          form.country
        );

      // ============================================================
      // VAT
      // ============================================================

      const vat_rate =
        form.vatRate !== ""
          ? parseFloat(form.vatRate)
          : getCountryVatRate(
            country_code
          );

      // ============================================================
      // AMOUNTS
      // ============================================================

      const gross_amount =
        form.grossAmount !== ""
          ? parseFloat(
            form.grossAmount
          )
          : null;

      const net_amount =
        form.netAmount !== ""
          ? parseFloat(
            form.netAmount
          )
          : null;

      const vat_amount =
        form.vatAmount !== ""
          ? parseFloat(
            form.vatAmount
          )
          : null;

      // ============================================================
      // PAID AMOUNT
      // ============================================================
      //
      // Keep the existing paid amount if the expense already has one.
      // Otherwise default to zero.
      //
      // This is better than blindly resetting it to zero during edit.
      // ============================================================

      const paid_amount =
        expense.paid_amount != null
          ? parseFloat(
            expense.paid_amount
          )
          : 0;

      // ============================================================
      // FX → SEK
      // ============================================================

      if (fxRateToSek == null) {
        throw new Error(
          `Unable to determine FX rate for ${form.currency}`
        );
      }

      const roundMoney = (value) =>
        Math.round(value * 100) / 100;

      // ============================================================
      // SEK AMOUNTS
      // ============================================================

      const gross_amount_sek =
        gross_amount != null
          ? roundMoney(
            gross_amount *
            fxRateToSek
          )
          : null;

      const paid_amount_sek =
        roundMoney(
          paid_amount *
          fxRateToSek
        );

      const vat_amount_sek =
        vat_amount != null
          ? roundMoney(
            vat_amount *
            fxRateToSek
          )
          : null;

      // ============================================================
      // EXPENSE DATA
      // ============================================================

      const updatedData = {
        vendor_name:
          form.vendorName,

        document_type:
          form.documentType,

        document_number:
          form.documentNumber || null,

        document_date:
          form.documentDate,

        due_date:
          form.dueDate || null,

        currency:
          form.currency,

        country_code,

        net_amount,

        vat_amount,

        vat_rate,

        gross_amount,

        // Keep paid amount.
        paid_amount,

        // ==========================================================
        // FX
        // ==========================================================

        fx_rate:
          fxRateToSek,

        fx_date:
          new Date()
            .toISOString()
            .slice(0, 10),

        fx_source:
          "frankfurter",

        // ==========================================================
        // SEK
        // ==========================================================

        gross_amount_sek,

        paid_amount_sek,

        vat_amount_sek,

        // ==========================================================
        // OTHER
        // ==========================================================

        category_id:
          form.category_id,

        payment_method:
          form.paymentMethod,

        notes:
          form.notes || null,
      };

      // ============================================================
      // DEBUG
      // ============================================================

      // console.log(
      //   "Updated expense data:",
      //   updatedData
      // );

      // console.table({
      //   vendor_name:
      //     updatedData.vendor_name,

      //   document_date:
      //     updatedData.document_date,

      //   currency:
      //     updatedData.currency,

      //   gross_amount:
      //     updatedData.gross_amount,

      //   net_amount:
      //     updatedData.net_amount,

      //   vat_amount:
      //     updatedData.vat_amount,

      //   vat_rate:
      //     updatedData.vat_rate,

      //   fx_rate:
      //     updatedData.fx_rate,

      //   gross_amount_sek:
      //     updatedData.gross_amount_sek,

      //   paid_amount:
      //     updatedData.paid_amount,

      //   paid_amount_sek:
      //     updatedData.paid_amount_sek,

      //   vat_amount_sek:
      //     updatedData.vat_amount_sek,

      //   category_id:
      //     updatedData.category_id,

      //   payment_method:
      //     updatedData.payment_method,
      // });

      // ============================================================
      // UPDATE EXPENSE
      // ============================================================

      const updated =
        await expenseRepository.update(
          expense.id,
          updatedData
        );

      setExpense(updated);

      // ============================================================
      // TOUCH DOCUMENT
      // ============================================================
      //
      // This updates document.updated_at without
      // changing its actual data.
      // ============================================================

      await documentRepository.update(
        docId,
        {}
      );

      // ============================================================
      // REVALIDATE RECONCILIATION
      // ============================================================

      const recon =
        await reconciliationService
          .revalidateMatchAfterExpenseEdit(
            expense.id,
            updated
          );

      if (
        recon?.action === "removed"
      ) {
        setReconWarning(
          recon.invalidReason
        );

        toast.warning(
          "Saved. Reconciliation match removed — " +
          recon.invalidReason +
          ". Open Reconciliation to re-match."
        );
      } else {
        setReconWarning(null);

        toast.success(
          "Changes saved"
        );
      }

      // ============================================================
      // UPDATE CANCEL SNAPSHOT
      // ============================================================

      setOriginalForm(
        formFromExpense(updated)
      );

    } catch (err) {
      console.error(
        "Failed to save expense:",
        err
      );

      toast.error(
        err.message ||
        "Failed to save changes"
      );

    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">
          Document or expense record not found
        </p>

        <Button
          asChild
          variant="outline"
        >
          <Link href="/documents">
            Back to documents
          </Link>
        </Button>
      </div>
    );
  }

  if (!doc || !form) {
    return null;
  }
  const ef =
    extraction?.fields ?? {};

  const hasExtraction =
    !!extraction;

  const validationIssues =
    extraction?.validationIssues ?? [];

  const liveGross =
    parseFloat(
      form.grossAmount
    ) || 0;

  const liveNet =
    parseFloat(
      form.netAmount
    ) || 0;

  const liveVat =
    parseFloat(
      form.vatAmount
    ) || 0;

  const liveSum =
    Math.round(
      (liveNet + liveVat) * 100
    ) / 100;

  const liveAmountMismatch =
    liveGross > 0 &&
    liveNet > 0 &&
    liveVat > 0 &&
    Math.abs(
      liveSum - liveGross
    ) >
    Math.max(
      0.05,
      liveGross * 0.005
    );

  return (
    <div className="flex flex-col h-full">

      <PageHeader
        title={doc.file_name}
        description={
          hasExtraction
            ? `Extracted via ${METHOD_LABELS[
            extraction.method
            ] ?? extraction.method
            } — verify all values`
            : "Edit approved document — updates are reflected immediately across all views"
        }
        actions={
          <div className="flex items-center gap-2">

            <Badge
              variant="success"
              className="text-xs"
            >
              Approved
            </Badge>

            <Button
              asChild
              variant="ghost"
              size="sm"
            >
              <Link href="/documents">
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Link>
            </Button>

          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-5xl">

          {/* ======================================================
            LEFT
        ====================================================== */}

          <div className="space-y-4">

            {/* Document Preview */}

            <Card>

              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Original Document
                </CardTitle>
              </CardHeader>

              <CardContent>

                {fileUrl ? (

                  doc.file_type ===
                    "application/pdf" ? (

                    <iframe
                      src={fileUrl}
                      className="w-full rounded border"
                      style={{
                        height: 500,
                      }}
                      title="Document preview"
                    />

                  ) : (

                    <img
                      src={fileUrl}
                      alt="Document"
                      className="w-full rounded border object-contain max-h-[500px]"
                    />

                  )

                ) : (

                  <div className="flex flex-col items-center justify-center aspect-[3/4] rounded-lg bg-muted border-2 border-dashed">

                    <FileText className="h-16 w-16 text-muted-foreground/30 mb-3" />

                    <p className="text-sm text-muted-foreground">
                      Loading preview…
                    </p>

                  </div>

                )}

              </CardContent>

            </Card>


            {/* Extraction failed */}

            {doc.extractionStatus ===
              "failed" && (

                <Alert variant="destructive">

                  <AlertTriangle className="h-4 w-4" />

                  <AlertDescription className="text-xs">
                    Automatic extraction failed for this file.
                    Fill in the form manually.
                  </AlertDescription>

                </Alert>

              )}


            {/* Extraction validation issues */}

            {hasExtraction &&
              validationIssues.length > 0 && (

                <Alert>

                  <AlertTriangle className="h-4 w-4" />

                  <AlertDescription className="text-xs space-y-1">

                    <p className="font-medium">
                      Validation issues — please check these fields:
                    </p>

                    {validationIssues.map(
                      (v, i) => (
                        <p
                          key={i}
                          className="text-muted-foreground"
                        >
                          {v.issue}
                        </p>
                      )
                    )}

                  </AlertDescription>

                </Alert>

              )}


            {/* Amount mismatch */}

            {liveAmountMismatch && (

              <Alert>

                <AlertTriangle className="h-4 w-4" />

                <AlertDescription className="text-xs">

                  Net ({liveNet}) + VAT ({liveVat}) ={" "}
                  {liveSum} ≠ Gross ({liveGross}) —
                  values don&apos;t add up.

                </AlertDescription>

              </Alert>

            )}


            {/* Extraction success */}

            {hasExtraction &&
              validationIssues.length === 0 &&
              !liveAmountMismatch && (

                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30">

                  <Zap className="h-4 w-4 text-blue-600" />

                  <AlertDescription className="text-xs text-blue-700 dark:text-blue-400">

                    Fields pre-filled from{" "}
                    {METHOD_LABELS[
                      extraction.method
                    ] ?? "extraction"}.
                    Review each value before saving.

                  </AlertDescription>

                </Alert>

              )}


            {/* No extraction */}

            {!hasExtraction &&
              doc.extractionStatus !==
              "failed" && (

                <Alert>

                  <Info className="h-4 w-4" />

                  <AlertDescription className="text-xs">

                    The original attachment is preserved.
                    Editing only updates the stored financial data.

                  </AlertDescription>

                </Alert>

              )}


            {/* Reconciliation warning */}

            {reconWarning && (

              <Alert variant="destructive">

                <AlertTriangle className="h-4 w-4" />

                <AlertDescription className="text-xs space-y-1">

                  <p className="font-medium">
                    Reconciliation match removed
                  </p>

                  <p className="text-muted-foreground">
                    {reconWarning}
                  </p>

                  <p>
                    This expense is now eligible for
                    re-matching in the Reconciliation view.
                  </p>

                </AlertDescription>

              </Alert>

            )}


            {/* Original attachment notice */}

            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30">

              <Info className="h-4 w-4 text-blue-600" />

              <AlertDescription className="text-xs text-blue-700 dark:text-blue-400">

                The original attachment is preserved.
                Editing only updates the stored financial data.

              </AlertDescription>

            </Alert>


            {/* Actions */}

            <div className="flex gap-2">

              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={saving}
              >

                <Save className="mr-2 h-4 w-4" />

                {saving
                  ? "Saving…"
                  : "Save Changes"}

              </Button>

              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >

                <X className="mr-2 h-4 w-4" />

                Cancel

              </Button>

            </div>

          </div>


          {/* ======================================================
            RIGHT
        ====================================================== */}

          <Card>

            <CardHeader className="pb-3">

              <CardTitle className="text-sm flex items-center gap-2">

                Financial Information

                {hasExtraction && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-normal"
                  >
                    Pre-filled · verify all values
                  </Badge>
                )}

                {!hasExtraction && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal"
                  >
                    Editing
                  </Badge>
                )}

              </CardTitle>

            </CardHeader>


            <CardContent className="space-y-5">

              {/* ==================================================
                DOCUMENT
            ================================================== */}

              <div className="space-y-3">

                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Document
                </p>


                <Field
                  label="Vendor / Merchant"
                  fieldKey="vendorName"
                  extractedField={
                    ef.vendorName
                  }
                >

                  <Input
                    value={
                      form.vendorName
                    }
                    onChange={(e) =>
                      set(
                        "vendorName",
                        e.target.value
                      )
                    }
                    placeholder="e.g. Amazon, Adobe"
                  />

                </Field>


                <div className="grid grid-cols-2 gap-3">

                  <Field
                    label="Document Type"
                    fieldKey="documentType"
                    extractedField={
                      ef.documentType
                    }
                  >

                    <Select
                      value={
                        form.documentType
                      }
                      onValueChange={(v) =>
                        set(
                          "documentType",
                          v
                        )
                      }
                    >

                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>

                        {APP_CONFIG.documentTypes.map(
                          (t) => (
                            <SelectItem
                              key={t.value}
                              value={t.value}
                            >
                              {t.label}
                            </SelectItem>
                          )
                        )}

                      </SelectContent>

                    </Select>

                  </Field>


                  <Field
                    label="Document / Invoice Number"
                    fieldKey="documentNumber"
                    extractedField={
                      ef.documentNumber
                    }
                  >

                    <Input
                      value={
                        form.documentNumber
                      }
                      onChange={(e) =>
                        set(
                          "documentNumber",
                          e.target.value
                        )
                      }
                      placeholder="INV-001"
                    />

                  </Field>

                </div>


                <div className="grid grid-cols-2 gap-3">

                  <Field
                    label="Document Date"
                    fieldKey="documentDate"
                    extractedField={
                      ef.documentDate
                    }
                  >

                    <Input
                      type="date"
                      value={
                        formatDateForInput(
                          form.documentDate
                        )
                      }
                      onChange={(e) =>
                        set(
                          "documentDate",
                          e.target.value
                        )
                      }
                    />

                  </Field>


                  <Field
                    label="Due Date"
                    fieldKey="dueDate"
                    extractedField={
                      ef.dueDate
                    }
                  >

                    <Input
                      type="date"
                      value={
                        formatDateForInput(
                          form.dueDate
                        )
                      }
                      onChange={(e) =>
                        set(
                          "dueDate",
                          e.target.value
                        )
                      }
                    />

                  </Field>

                </div>

              </div>


              <Separator />


              {/* ==================================================
                AMOUNTS
            ================================================== */}

              <div className="space-y-3">

                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Amounts
                </p>


                {/* Currency + Country */}

                <div className="grid grid-cols-2 gap-3">

                  <Field
                    label="Currency"
                    fieldKey="currency"
                    extractedField={
                      ef.currency
                    }
                  >

                    <Select
                      value={
                        form.currency
                      }
                      onValueChange={(v) =>
                        set(
                          "currency",
                          v
                        )
                      }
                    >

                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>

                        {APP_CONFIG.supportedCurrencies.map(
                          (currency) => (
                            <SelectItem
                              key={currency}
                              value={currency}
                            >
                              {currency}
                            </SelectItem>
                          )
                        )}

                      </SelectContent>

                    </Select>

                  </Field>


                  <Field
                    label="Country"
                    fieldKey="country"
                    extractedField={
                      ef.country
                    }
                  >

                    <Input
                      value={
                        form.country
                      }
                      onChange={(e) => {

                        const value =
                          e.target.value;

                        setForm((current) => ({
                          ...current,

                          country:
                            value,

                          countryCode:
                            countryNameToCode(
                              value
                            ),
                        }));

                        vatManuallySet.current =
                          false;

                      }}
                      placeholder="e.g. Israel"
                    />

                  </Field>

                </div>


                {/* VAT Rate */}

                <Field
                  label="VAT Rate (%)"
                  fieldKey="vatRate"
                  extractedField={
                    ef.vatRate
                  }
                >

                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={
                      form.vatRate
                    }
                    onChange={(e) => {

                      const value =
                        e.target.value;

                      vatManuallySet.current =
                        true;

                      set(
                        "vatRate",
                        value
                      );

                      recalcFromGross(
                        form.grossAmount,
                        value
                      );

                    }}
                    placeholder="e.g. 18"
                    className={
                      ef.vatRate?.status ===
                        "invalid"
                        ? "border-red-400"
                        : ""
                    }
                  />

                </Field>


                {/* Gross */}

                <Field
                  label="Total Paid (Gross)"
                  fieldKey="grossAmount"
                  extractedField={
                    ef.grossAmount
                  }
                >

                  <Input
                    type="number"
                    step="0.01"
                    value={
                      form.grossAmount
                    }
                    onChange={(e) => {

                      const value =
                        e.target.value;

                      set(
                        "grossAmount",
                        value
                      );

                      recalcFromGross(
                        value,
                        form.vatRate
                      );

                    }}
                    placeholder="0.00"
                    className={
                      ef.grossAmount?.status ===
                        "invalid"
                        ? "border-red-400"
                        : ""
                    }
                  />

                </Field>


                <p className="text-[10px] text-muted-foreground -mt-1">
                  Total amount paid (including VAT).
                  Net and VAT amount recalculate automatically
                  when VAT rate is set.
                </p>


                {/* Net + VAT */}

                <div className="grid grid-cols-2 gap-3">

                  <Field
                    label="Net Amount"
                    fieldKey="netAmount"
                    extractedField={
                      ef.netAmount
                    }
                  >

                    <Input
                      type="number"
                      step="0.01"
                      value={
                        form.netAmount
                      }
                      onChange={(e) =>
                        set(
                          "netAmount",
                          e.target.value
                        )
                      }
                      placeholder="0.00"
                      className={
                        ef.netAmount?.status ===
                          "invalid"
                          ? "border-red-400"
                          : ""
                      }
                    />

                  </Field>


                  <Field
                    label="VAT Amount"
                    fieldKey="vatAmount"
                    extractedField={
                      ef.vatAmount
                    }
                  >

                    <Input
                      type="number"
                      step="0.01"
                      value={
                        form.vatAmount
                      }
                      onChange={(e) =>
                        set(
                          "vatAmount",
                          e.target.value
                        )
                      }
                      placeholder="0.00"
                      className={
                        ef.vatAmount?.status ===
                          "invalid"
                          ? "border-red-400"
                          : ""
                      }
                    />

                  </Field>

                </div>

              </div>


              <Separator />


              {/* ==================================================
                CLASSIFICATION
            ================================================== */}

              <div className="space-y-3">

                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Classification
                </p>


                <Field label="Category">

                  <Select
                    value={
                      form.category_id
                    }
                    onValueChange={(value) =>
                      set(
                        "category_id",
                        value
                      )
                    }
                  >

                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>

                    <SelectContent>

                      {categories.map(
                        (category) => (
                          <SelectItem
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </SelectItem>
                        )
                      )}

                    </SelectContent>

                  </Select>

                </Field>


                <Field label="Payment Method">

                  <Select
                    value={
                      form.paymentMethod
                    }
                    onValueChange={(v) =>
                      set(
                        "paymentMethod",
                        v
                      )
                    }
                  >

                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>

                      {APP_CONFIG.paymentMethods.map(
                        (method) => (
                          <SelectItem
                            key={method.value}
                            value={method.value}
                          >
                            {method.label}
                          </SelectItem>
                        )
                      )}

                    </SelectContent>

                  </Select>

                </Field>

              </div>


              <Separator />


              {/* ==================================================
                NOTES
            ================================================== */}

              <Field
                label="Notes / Description"
                fieldKey="notes"
              >

                <Textarea
                  value={
                    form.notes
                  }
                  onChange={(e) =>
                    set(
                      "notes",
                      e.target.value
                    )
                  }
                  placeholder="Optional notes or description…"
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
