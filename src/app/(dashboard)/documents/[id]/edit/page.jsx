"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Save, X, FileText, ChevronLeft, AlertTriangle, Info,
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
import { reconciliationService } from "@/services/reconciliation.service";
import { APP_CONFIG } from "@/config";
import { calculateFromGross } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { documentRepository } from "@/services/backend-documents";
import { expenseRepository } from "@/services/backend-expenses";

/** Build editable form state from a persisted expense record */
function formFromExpense(expense) {
  return {
    vendorName: expense.vendorName ?? "",
    documentType: expense.documentType ?? "receipt",
    documentNumber: expense.documentNumber ?? "",
    documentDate: expense.documentDate ?? "",
    dueDate: expense.dueDate ?? "",
    currency: expense.currency ?? "ILS",
    country: expense.country ?? "",
    // Show 0-rate as blank so it reads as "not set"
    vatRate: expense.vatRate != null && expense.vatRate !== 0
      ? String(expense.vatRate)
      : "",
    grossAmount: expense.grossAmount != null ? String(expense.grossAmount) : "",
    netAmount: expense.netAmount != null ? String(expense.netAmount) : "",
    vatAmount: expense.vatAmount != null ? String(expense.vatAmount) : "",
    category: expense.category ?? "",
    paymentMethod: expense.paymentMethod ?? "unknown",
    cardLastFour: expense.cardLastFour ?? "",
    notes: expense.notes ?? "",
  };
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function EditDocumentPage() {
  const router = useRouter();
  const params = useParams();
  const docId = params?.id;

  const [doc, setDoc] = useState(null);
  const [expense, setExpense] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [form, setForm] = useState(null);
  const [originalForm, setOriginalForm] = useState(null); // snapshot for cancel
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reconWarning, setReconWarning] = useState(null);

  useEffect(() => {
    if (!docId) return;
    async function load() {
      const d = await documentRepository.getById(docId);
      if (!d) { setNotFound(true); return; }
      setDoc(d);

      const exp = await expenseRepository.getByDocumentId(docId);
      if (!exp) { setNotFound(true); return; }
      setExpense(exp);
    }
    load();

    const initial = formFromExpense(exp);
    setForm(initial);
    setOriginalForm(initial);


  }, [docId]);

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  /**
   * Auto-recalculate net + VAT amount when gross or VAT rate changes.
   * Clears net/vatAmount if rate is blank.
   */
  const recalcFromGross = useCallback((grossStr, rateStr) => {
    const gross = parseFloat(grossStr);
    if (isNaN(gross) || gross <= 0) return;
    if (!rateStr || rateStr === "") {
      setForm((f) => ({ ...f, netAmount: "", vatAmount: "" }));
      return;
    }
    const rate = parseFloat(rateStr);
    if (isNaN(rate) || rate < 0) return;
    const { netAmount, vatAmount } = calculateFromGross(gross, rate);
    setForm((f) => ({ ...f, netAmount: String(netAmount), vatAmount: String(vatAmount) }));
  }, []);

  const handleCancel = () => {
    setForm(originalForm);
    setReconWarning(null);
    router.push("/documents");
  };

  const handleSave = async () => {
    if (!expense) return;

    setSaving(true);

    try {
      const updatedData = {
        vendor_name: form.vendorName,
        document_type: form.documentType,
        document_number: form.documentNumber || null,
        document_date: form.documentDate,
        due_date: form.dueDate || null,

        currency: form.currency,
        country_code: countryNameToCode(form.country),

        vat_rate:
          form.vatRate !== ""
            ? parseFloat(form.vatRate)
            : null,

        gross_amount:
          form.grossAmount !== ""
            ? parseFloat(form.grossAmount)
            : null,

        net_amount:
          form.netAmount !== ""
            ? parseFloat(form.netAmount)
            : null,

        vat_amount:
          form.vatAmount !== ""
            ? parseFloat(form.vatAmount)
            : null,

        category_id: form.category_id,

        payment_method: form.paymentMethod,

        card_last_four:
          form.cardLastFour || null,

        notes:
          form.notes || null,
      };

      // Persist expense changes.
      // The repository handles the audit log.
      const updated =
        await expenseRepository.update(
          expense.id,
          updatedData
        );

      setExpense(updated);

      // Touch document updated_at so lists show fresh timestamp.
      // The repository handles the audit log.
      await documentRepository.update(docId, {});

      // Re-validate any confirmed reconciliation match
      const recon =
        await reconciliationService.revalidateMatchAfterExpenseEdit(
          expense.id,
          updated
        );

      if (recon.action === "removed") {
        setReconWarning(recon.invalidReason);

        toast.warning(
          "Saved. Reconciliation match removed — " +
          recon.invalidReason +
          ". Open Reconciliation to re-match."
        );
      } else {
        setReconWarning(null);
        toast.success("Changes saved");
      }

      // Update snapshot so a subsequent Cancel
      // won't revert past this save
      setOriginalForm(
        formFromExpense(updated)
      );

    } catch (err) {
      console.error(
        "Failed to save expense:",
        err
      );

      toast.error(
        err.message || "Failed to save changes"
      );

    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Document or expense record not found</p>
        <Button asChild variant="outline">
          <Link href="/documents">Back to documents</Link>
        </Button>
      </div>
    );
  }

  if (!doc || !form) return null;

  const liveGross = parseFloat(form.grossAmount) || 0;
  const liveNet = parseFloat(form.netAmount) || 0;
  const liveVat = parseFloat(form.vatAmount) || 0;
  const liveSum = Math.round((liveNet + liveVat) * 100) / 100;
  const liveAmountMismatch =
    liveGross > 0 && liveNet > 0 && liveVat > 0 &&
    Math.abs(liveSum - liveGross) > Math.max(0.05, liveGross * 0.005);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={doc.fileName}
        description="Edit approved document — updates are reflected immediately across all views"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">Approved</Badge>
            <Button asChild variant="ghost" size="sm">
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

          {/* LEFT: Original document preview + actions */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Original Document</CardTitle>
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
                      alt="Document"
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

            {/* Reconciliation warning (shown after a save that removed a match) */}
            {reconWarning && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs space-y-1">
                  <p className="font-medium">Reconciliation match removed</p>
                  <p className="text-muted-foreground">{reconWarning}</p>
                  <p>This expense is now eligible for re-matching in the Reconciliation view.</p>
                </AlertDescription>
              </Alert>
            )}

            {/* Amount mismatch warning */}
            {liveAmountMismatch && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Net ({liveNet}) + VAT ({liveVat}) = {liveSum} ≠ Gross ({liveGross}) — values don&apos;t add up.
                </AlertDescription>
              </Alert>
            )}

            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-xs text-blue-700 dark:text-blue-400">
                The original attachment is preserved. Editing only updates the stored financial data.
              </AlertDescription>
            </Alert>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={saving}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>

          {/* RIGHT: Editable form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                Financial Information
                <Badge variant="outline" className="text-[10px] font-normal">Editing</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Document section */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Document</p>

                <Field label="Vendor / Merchant">
                  <Input
                    value={form.vendorName}
                    onChange={(e) => set("vendorName", e.target.value)}
                    placeholder="e.g. Amazon, Adobe"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Document Type">
                    <Select value={form.documentType} onValueChange={(v) => set("documentType", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {APP_CONFIG.documentTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Document / Invoice Number">
                    <Input
                      value={form.documentNumber}
                      onChange={(e) => set("documentNumber", e.target.value)}
                      placeholder="INV-001"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Document Date">
                    <Input
                      type="date"
                      value={form.documentDate}
                      onChange={(e) => set("documentDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Due Date">
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

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Currency">
                    <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {APP_CONFIG.supportedCurrencies.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Country">
                    <Input
                      value={form.country}
                      onChange={(e) => set("country", e.target.value)}
                      placeholder="e.g. Israel"
                    />
                  </Field>
                </div>

                <Field label="VAT Rate (%)">
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
                  />
                </Field>

                <Field label="Total Paid (Gross)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.grossAmount}
                    onChange={(e) => {
                      set("grossAmount", e.target.value);
                      recalcFromGross(e.target.value, form.vatRate);
                    }}
                    placeholder="0.00"
                  />
                </Field>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Total amount paid (including VAT). Net and VAT amount recalculate automatically when VAT rate is set.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Net Amount">
                    <Input
                      type="number"
                      step="0.01"
                      value={form.netAmount}
                      onChange={(e) => set("netAmount", e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="VAT Amount">
                    <Input
                      type="number"
                      step="0.01"
                      value={form.vatAmount}
                      onChange={(e) => set("vatAmount", e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                </div>
              </div>

              <Separator />

              {/* Classification section */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Classification</p>

                <Field label="Category">
                  <Select value={form.category} onValueChange={(v) => set("category", v)}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {APP_CONFIG.defaultCategories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Payment Method">
                  <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APP_CONFIG.paymentMethods.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {form.paymentMethod === "credit_card" && (
                  <Field label="Card Last 4 Digits">
                    <Input
                      value={form.cardLastFour}
                      onChange={(e) =>
                        set("cardLastFour", e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="1234"
                      maxLength={4}
                    />
                  </Field>
                )}
              </div>

              <Separator />

              <Field label="Notes / Description">
                <Textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
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
