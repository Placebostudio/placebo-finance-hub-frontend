"use client";
import React, { useEffect, useState, useCallback } from "react";
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
import { toast } from "sonner";
import Link from "next/link";

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
  category: "",
  paymentMethod: "unknown",
  notes: "",
};

/** Map field status → badge appearance */
const FIELD_STATUS_BADGE = {
  found:   { label: "Extracted",  className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  review:  { label: "Auto-detect", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  missing: { label: "Missing",    className: "bg-muted text-muted-foreground" },
  invalid: { label: "Invalid",    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

/** Method → human label */
const METHOD_LABELS = {
  pdf_text:         "Digital PDF",
  image_ocr:        "Image OCR",
  scanned_pdf_ocr:  "Scanned PDF (OCR)",
  manual:           "Manual entry",
};

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
function formFromExtraction(fields) {
  if (!fields) return EMPTY_FORM;
  const f = fields;
  return {
    vendorName:     f.vendorName?.value    ?? "",
    documentType:   f.documentType?.value  ?? "receipt",
    documentNumber: f.documentNumber?.value ?? "",
    documentDate:   f.documentDate?.value  ?? "",
    dueDate:        f.dueDate?.value       ?? "",
    currency:       f.currency?.value      ?? "ILS",
    // Country: use human-readable name if available
    country:        f.country?.countryName ?? f.country?.value ?? "",
    // Gross is Total Paid — the primary amount
    grossAmount:    f.grossAmount?.value != null ? String(f.grossAmount.value) : "",
    // vatRate: only set when actually found or derived from country (not null/missing)
    vatRate:        f.vatRate?.value != null && f.vatRate.status !== "missing"
                      ? String(f.vatRate.value)
                      : "",
    netAmount:      f.netAmount?.value != null  ? String(f.netAmount.value)  : "",
    vatAmount:      f.vatAmount?.value != null  ? String(f.vatAmount.value)  : "",
    category:       "",
    paymentMethod:  "unknown",
    notes:          "",
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

  useEffect(() => {
    if (!id) return;
    const d = documentService.getById(id);
    if (!d) { setNotFound(true); return; }
    setDoc(d);

    if (d.extractionResult?.fields) {
      setForm(formFromExtraction(d.extractionResult.fields));
    }

    documentService.getFile(id).then((blob) => {
      if (blob) setFileUrl(URL.createObjectURL(blob));
    });
  }, [id]);

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

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

  const save = async (status) => {
    setSaving(true);
    try {
      expenseService.create({
        documentId:     id,
        vendorName:     form.vendorName,
        documentType:   form.documentType,
        documentNumber: form.documentNumber,
        documentDate:   form.documentDate,
        dueDate:        form.dueDate,
        currency:       form.currency,
        country:        form.country,
        netAmount:      parseFloat(form.netAmount)   || 0,
        vatRate:        parseFloat(form.vatRate)     || 0,
        vatAmount:      parseFloat(form.vatAmount)   || 0,
        grossAmount:    parseFloat(form.grossAmount) || 0,
        category:       form.category,
        paymentMethod:  form.paymentMethod,
        notes:          form.notes,
        status,
      });

      documentService.updateStatus(
        id,
        status === "draft"     ? "pending_review" :
        status === "rejected"  ? "rejected" : "approved"
      );

      toast.success(
        status === "approved" ? "Expense approved and saved" :
        status === "rejected" ? "Document rejected" :
        "Draft saved"
      );

      if (status !== "draft") router.push("/documents/review");
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

  const extraction = doc.extractionResult;
  const ef = extraction?.fields ?? {};
  const hasExtraction = !!extraction;
  const validationIssues = extraction?.validationIssues ?? [];

  // Check whether net + vatAmount ≈ gross for live form values
  const liveGross = parseFloat(form.grossAmount) || 0;
  const liveNet   = parseFloat(form.netAmount)   || 0;
  const liveVat   = parseFloat(form.vatAmount)   || 0;
  const liveSum   = Math.round((liveNet + liveVat) * 100) / 100;
  const liveAmountMismatch = liveGross > 0 && liveNet > 0 && liveVat > 0 &&
    Math.abs(liveSum - liveGross) > Math.max(0.05, liveGross * 0.005);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={doc.fileName}
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
                  doc.fileType === "application/pdf" ? (
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
                    <Input
                      type="date"
                      value={form.documentDate}
                      onChange={(e) => set("documentDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Due Date" fieldKey="dueDate" extractedField={ef.dueDate}>
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => set("dueDate", e.target.value)}
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
                  <Select value={form.category} onValueChange={(v) => set("category", v)}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {APP_CONFIG.defaultCategories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
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
