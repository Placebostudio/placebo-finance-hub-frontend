"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import {
  CreditCard, Upload, Plus, Trash2, Search, CheckCircle2,
  AlertCircle, FileText, Edit2, X, Loader2, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/store/auth";
import { APP_CONFIG } from "@/config";
import { formatCurrency, formatDate, generateId, buildPeriod, periodLabel } from "@/lib/utils";
import { PeriodSelector } from "@/components/layout/period-selector";
import { usePeriodStore } from "@/store/period";
import { toast } from "sonner";

import { statementService } from "@/services/statement.service";
import { auditService } from "@/services/audit.service";
import { transactionService } from "@/services/transaction.service";

import { transactionRepository } from "@/services/backend-transactions";
import { statementRepository } from "@/services/backend-statements";

// ── Preview row edit dialog ───────────────────────────────────────────────────
function EditRowDialog({ row, open, onClose, onSave }) {
  const [form, setForm] = useState(row ?? {});
  useEffect(() => { if (row) setForm(row); }, [row]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Transaction Row</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Transaction Date</Label>
              <Input type="date" value={form.transactionDate ?? ""} onChange={(e) => set("transactionDate", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Posting Date</Label>
              <Input type="date" value={form.postingDate ?? ""} onChange={(e) => set("postingDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount (billed)</Label>
              <Input type="number" step="0.01" value={form.billedAmount ?? ""} onChange={(e) => set("billedAmount", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Select value={form.billedCurrency ?? "ILS"} onValueChange={(v) => set("billedCurrency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APP_CONFIG.supportedCurrencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Card Last 4</Label>
            <Input value={form.cardLastFour ?? ""} onChange={(e) => set("cardLastFour", e.target.value)} maxLength={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(form); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Blank transaction template ────────────────────────────────────────────────
function blankRow() {
  return {
    id: generateId(),
    transactionDate: "", postingDate: "", description: "",
    normalizedDescription: "", originalAmount: 0, originalCurrency: "ILS",
    billedAmount: 0, billedCurrency: "ILS", cardLastFour: "", status: "unmatched",
  };
}

// ── Stage label helper ────────────────────────────────────────────────────────
function stageLabel(stage, detail) {
  if (stage === "pdf") return detail ?? "Reading PDF…";
  if (stage === "render") return detail ?? "Rendering pages…";
  if (stage === "ocr") return detail ?? "Running OCR…";
  if (stage === "parsing") return detail ?? "Detecting transactions…";
  if (stage === "done") return detail;
  return detail ?? "Processing…";
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TransactionsPage() {
  // ── Period state (shared across all finance pages via period store) ──────────
  const {
    month: periodMonth,
    year: periodYear,
    setPeriod
  } = usePeriodStore();

  const { user: currentUser } = useAuthStore();

  const selectedPeriod =
    buildPeriod(periodYear, periodMonth);


  // ── Data state ───────────────────────────────────────────────────────────────

  const [statements, setStatements] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [search, setSearch] = useState("");


  // CSV state — kept, but CSV functionality is disabled
  const [importPreview, setImportPreview] = useState([]);
  const [importError, setImportError] = useState(null);
  const [isImporting, setIsImporting] = useState(false);


  // ── PDF import state ─────────────────────────────────────────────────────────

  const [pdfFile, setPdfFile] = useState(null);
  const [pdfExtracting, setPdfExtracting] = useState(false);

  const [pdfProgress, setPdfProgress] = useState({
    percent: 0,
    label: ""
  });

  const [pdfRows, setPdfRows] = useState(null);
  const [pdfIssues, setPdfIssues] = useState([]);
  const [pdfExtractedText, setPdfExtractedText] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);


  // ── Load data ────────────────────────────────────────────────────────────────

  async function load() {
    try {
      console.log(selectedPeriod)
      const [
        statementsData,
        transactionsData
      ] = await Promise.all([statementRepository.getAll({
        period: selectedPeriod,
        spam: false,
      }),

      transactionRepository.getAll({
        statement_period: selectedPeriod,
        spam: false,
      }),
      ]);

      setStatements(statementsData);
      setTransactions(transactionsData);

    } catch (err) {
      console.error(
        "Failed to load statements and transactions:",
        err
      );

      toast.error(
        err.message ||
        "Failed to load finance data"
      );
    }
  }


  useEffect(() => {
    load();
  }, []);

  // ── Period-scoped derived data ───────────────────────────────────────────────

  const periodStatements =
    statements.filter(
      (s) => s.statement_period === selectedPeriod
    );

  const periodTransactions =
    transactions.filter(
      (t) => t.statement_period === selectedPeriod
    );

  const periodMatched =
    periodTransactions.filter(
      (t) => t.status === "matched"
    ).length;

  const periodUnmatched =
    periodTransactions.filter(
      (t) =>
        t.status !== "matched" &&
        t.status !== "ignored"
    ).length;

  const duplicateStatementExists =
    periodStatements.length > 0;

  // ── Period change ────────────────────────────────────────────────────────────

  const handlePeriodChange =
    (month, year) => {

      setPeriod(month, year);
      setSelectedStatement(null);

    };


  // ── Transactions tab ─────────────────────────────────────────────────────────

  const visibleTransactions =
    selectedStatement
      ? transactions.filter(
        (t) =>
          t.statementId ===
          selectedStatement
      )
      : periodTransactions;


  const filtered =
    visibleTransactions.filter(
      (t) =>
        !search ||
        t.description
          .toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||
        (t.cardLastFour ?? "")
          .includes(search)
    );


  // ── CSV IMPORT ───────────────────────────────────────────────────────────────
  // CSV functionality is disabled but intentionally kept.

  const onDropCSV = useCallback(
    (acceptedFiles) => {

      // Disabled
      return;

    },
    []
  );


  const {
    getRootProps: getCSVRootProps,
    getInputProps: getCSVInputProps,
    isDragActive: isCSVDragActive
  } =
    useDropzone({

      onDrop: onDropCSV,

      accept: {
        "text/csv": [".csv"],
        "application/vnd.ms-excel": [".csv"]
      },

      multiple: false,

      disabled: true

    });


  // ── Manual statement creation ───────────────────────────────────────────────
  // Disabled. Do not use statementService anymore.

  const handleCreateStatement = () => {

    toast.info(
      "Manual statement creation is currently disabled."
    );

  };


  // ── CSV import ──────────────────────────────────────────────────────────────
  // Kept for future use, but disabled.

  const handleImportCSV = (stmtId) => {

    toast.info(
      "CSV import is currently disabled."
    );

    return;

  };


  // ── Delete statement ────────────────────────────────────────────────────────

  const handleDeleteStatement = async (id) => {

    if (
      !confirm(
        "Delete this statement and all its transactions?"
      )
    ) {
      return;
    }

    try {

      const stmt =
        await statementRepository.getById(
          id
        );

      if (!stmt) {

        toast.error(
          "Statement not found"
        );

        return;
      }

      await statementRepository.softDelete(
        id,
        currentUser?.id,
        currentUser?.fullName
      );

      toast.success(
        "Statement deleted"
      );

      if (
        selectedStatement === id
      ) {

        setSelectedStatement(
          null
        );

      }

      await load();

    } catch (err) {

      console.error(
        "Failed to delete statement:",
        err
      );

      toast.error(
        err.message ||
        "Failed to delete statement"
      );

    }
  };


  // ── PDF statement import ─────────────────────────────────────────────────────

  const onDropPDF = useCallback(
    (acceptedFiles) => {

      const file =
        acceptedFiles[0];

      if (!file) {
        return;
      }

      setPdfFile(file);

      setPdfRows(null);

      setPdfIssues([]);

      setPdfExtractedText("");

      setPdfProgress({
        percent: 0,
        label: ""
      });

    },
    []
  );


  const {
    getRootProps: getPDFRootProps,
    getInputProps: getPDFInputProps,
    isDragActive: isPDFDragActive
  } =
    useDropzone({

      onDrop: onDropPDF,

      accept: {
        "application/pdf": [".pdf"]
      },

      multiple: false

    });


  // ── Extract PDF ──────────────────────────────────────────────────────────────

  const handleExtractPDF = async () => {

    if (!pdfFile) {
      return;
    }

    setPdfExtracting(true);

    setPdfRows(null);

    setPdfIssues([]);

    try {

      const {
        extractStatement
      } =
        await import(
          "@/services/extraction/document-extractor"
        );


      const result =
        await extractStatement(
          pdfFile,
          ({
            stage,
            detail,
            percent
          }) => {

            setPdfProgress({
              percent,
              label:
                stageLabel(
                  stage,
                  detail
                )
            });

          }
        );


      // result.transactions is the parser output
      setPdfRows(
        result.transactions
      );

      setPdfIssues(
        result.issues ?? []
      );

      setPdfExtractedText(
        result.extractedText ?? ""
      );


      if (
        result.transactions.length > 0
      ) {

        toast.success(
          `Detected ${result.transactions.length} transactions — review and confirm`
        );

      } else {

        toast.warning(
          "No transactions detected automatically."
        );

      }

    } catch (err) {

      console.error(
        "Statement extraction failed:",
        err
      );

      setPdfIssues([
        "Extraction failed: " +
        (
          err?.message ??
          "Unknown error"
        )
      ]);

      setPdfRows([]);

      toast.error(
        "Extraction failed"
      );

    } finally {

      setPdfExtracting(false);

    }

  };


  // ── PDF preview editing ──────────────────────────────────────────────────────

  const updatePreviewRow =
    (id, changes) => {

      setPdfRows(
        (rows) =>
          rows.map(
            (r) =>
              r.id === id
                ? {
                  ...r,
                  ...changes
                }
                : r
          )
      );

    };


  const removePreviewRow =
    (id) => {

      setPdfRows(
        (rows) =>
          rows.filter(
            (r) =>
              r.id !== id
          )
      );

    };


  const addPreviewRow =
    () => {

      setPdfRows(
        (rows) => [
          ...(rows ?? []),
          blankRow()
        ]
      );

    };


  // ── Confirm PDF import ───────────────────────────────────────────────────────

  const handleConfirmPDFImport = async () => {
    if (
      !pdfRows ||
      pdfRows.length === 0
    ) {

      toast.error(
        "No transactions to import"
      );

      return;
    }


    setIsConfirming(true);


    try {

      // ============================================================
      // PREPARE TRANSACTIONS
      // ============================================================

      const rowsToImport =
        pdfRows

          .filter(
            (row) =>
              row.description &&
              row.transactionDate &&
              row.billedAmount !== null &&
              row.billedAmount !== undefined
          )

          .map(
            (row, index) => ({

              line_no:
                index + 1,

              transaction_date:
                row.transactionDate,

              posting_date:
                row.postingDate ??
                null,

              description:
                row.description,

              normalized_description:
                row.normalizedDescription ??
                row.description
                  .toLowerCase()
                  .replace(
                    /\d+(?:[.,]\d+)?/g,
                    ""
                  )
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim(),

              counterparty_ref:
                row.counterpartyRef ??
                null,

              original_currency:
                row.originalCurrency ??
                null,

              billed_amount:
                row.billedAmount,

              billed_currency:
                row.billedCurrency ??
                "SEK",

              status:
                row.status ??
                "unmatched",

              coverage_state:
                row.coverageState ??
                "unmatched",

              row_hash:
                row.rowHash,

              spam:
                false

            })
          );


      // ============================================================
      // VALIDATE
      // ============================================================

      if (
        rowsToImport.length === 0
      ) {

        toast.error(
          "No valid transactions to import"
        );

        return;
      }


      // ============================================================
      // CREATE STATEMENT
      // ============================================================

      const statementData = {

        statement_type:
          "bank_account",

        period:
          selectedPeriod,

        source:
          "pdf",

        file_name:
          pdfFile?.name ??
          null,

        transaction_count:
          0,

        spam:
          false

      };


      const stmt =
        await statementRepository.create(
          statementData
        );


      // ============================================================
      // CREATE TRANSACTIONS
      // ============================================================

      const created =
        await transactionRepository.createBulk(
          rowsToImport,
          stmt.id,
          selectedPeriod
        );


      // ============================================================
      // REFRESH
      // ============================================================

      await load();


      setSelectedStatement(
        stmt.id
      );


      setPdfFile(null);

      setPdfRows(null);

      setPdfIssues([]);

      setPdfExtractedText("");


      toast.success(
        `Imported ${created.length} transactions for ${periodLabel(selectedPeriod)}`
      );


    } catch (err) {

      console.error(
        "PDF import failed:",
        err
      );

      toast.error(
        "Import failed: " +
        (
          err?.message ??
          "Unknown error"
        )
      );

    } finally {

      setIsConfirming(false);

    }

  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Transactions" description="Credit card statements and individual transactions" />

      <div className="flex-1 p-6 overflow-auto">

        {/* ── Period selector bar (always visible above tabs) ── */}
        <div className="mb-4 flex items-center gap-4 flex-wrap rounded-lg border bg-muted/30 px-4 py-2.5">
          <PeriodSelector month={periodMonth} year={periodYear} onChange={handlePeriodChange} />
          {periodTransactions.length > 0 && (
            <div className="flex items-center gap-1 ml-1 text-sm text-muted-foreground">
              <span className="text-foreground font-semibold">{periodTransactions.length}</span> txns
              <span className="mx-1 text-border">·</span>
              <span className="text-green-600 font-semibold">{periodMatched}</span> matched
              <span className="mx-1 text-border">·</span>
              <span className="text-red-500 font-semibold">{periodUnmatched}</span> unmatched
              <span className="mx-1 text-border">·</span>
              <span className="text-foreground font-semibold">{periodStatements.length}</span> statement{periodStatements.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        <Tabs defaultValue="transactions">
          <TabsList>
            <TabsTrigger value="transactions">
              <CreditCard className="mr-2 h-4 w-4" />
              Transactions ({periodTransactions.length})
            </TabsTrigger>
            <TabsTrigger value="statements">
              <FileText className="mr-2 h-4 w-4" />
              Statements ({statements.length})
            </TabsTrigger>
            <TabsTrigger value="import-pdf">
              <Upload className="mr-2 h-4 w-4" />
              Import PDF
            </TabsTrigger>
            <TabsTrigger value="import-csv" disabled>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </TabsTrigger>
          </TabsList>

          {/* ── Transactions tab ── */}
          <TabsContent value="transactions" className="mt-4 space-y-4">
            <div className="flex gap-3 items-center flex-wrap">
              <div className="relative flex-1 min-w-48 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {periodTransactions.length > 0 && (
                <Select
                  value={selectedStatement ?? "all"}
                  onValueChange={(v) =>
                    setSelectedStatement(v === "all" ? null : v)
                  }
                >
                  <SelectTrigger className="w-52">
                    <SelectValue
                      placeholder={`All ${periodLabel(selectedPeriod)}`}
                    />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="all">
                      All {periodLabel(selectedPeriod)}
                    </SelectItem>

                    {periodStatements.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.file_name ||
                          s.statement_period ||
                          s.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {periodTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CreditCard className="h-12 w-12 mb-4 opacity-30" />

                <p className="text-sm font-medium">
                  No transactions for {periodLabel(selectedPeriod)}
                </p>

                <p className="text-xs mt-1 text-center">
                  Use the Import PDF tab to import the{" "}
                  {periodLabel(selectedPeriod)} statement,
                  <br />
                  or change the period above to view another month.
                </p>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Date</TableHead>
                        <TableHead>Posting Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Counterparty</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Different Currency</TableHead>
                        <TableHead className="text-right">
                          Original Amount
                        </TableHead>
                        <TableHead>Original Currency</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Coverage</TableHead>
                        <TableHead>Ignore Reason</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filtered.map((txn) => (
                        <TableRow key={txn.id}>

                          {/* Transaction date */}
                          <TableCell className="text-sm whitespace-nowrap">
                            {txn.transaction_date
                              ? formatDate(txn.transaction_date)
                              : "—"}
                          </TableCell>

                          {/* Posting date */}
                          <TableCell className="text-sm whitespace-nowrap">
                            {txn.posting_date
                              ? formatDate(txn.posting_date)
                              : "—"}
                          </TableCell>

                          {/* Description */}
                          <TableCell className="text-sm max-w-[220px] truncate">
                            {txn.description || "—"}
                          </TableCell>

                          {/* Counterparty */}
                          <TableCell className="text-sm max-w-[180px] truncate">
                            {txn.counterparty_ref || "—"}
                          </TableCell>

                          {/* Billed amount */}
                          <TableCell className="text-right text-sm font-mono font-semibold whitespace-nowrap">
                            {txn.billed_amount !== null &&
                              txn.billed_amount !== undefined
                              ? formatCurrency(
                                Math.abs(Number(txn.billed_amount)),
                                txn.billed_currency
                              )
                              : "—"}
                          </TableCell>

                          {/* Billed currency */}
                          <TableCell className="text-sm font-mono">
                            {txn.billed_currency || "—"}
                          </TableCell>

                          {/* Different currency */}
                          <TableCell className="text-sm font-mono">
                            {txn.original_currency &&
                              txn.original_currency !== txn.billed_currency
                              ? "Yes"
                              : "No"}
                          </TableCell>

                          {/* Original amount */}
                          <TableCell className="text-right text-sm font-mono whitespace-nowrap">
                            {txn.original_amount !== null &&
                              txn.original_amount !== undefined
                              ? Number(txn.original_amount).toFixed(2)
                              : "—"}
                          </TableCell>

                          {/* Original currency */}
                          <TableCell className="text-sm font-mono">
                            {txn.original_currency || "—"}
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Badge
                              variant={
                                txn.status === "matched"
                                  ? "success"
                                  : txn.status === "ignored"
                                    ? "secondary"
                                    : "outline"
                              }
                              className="text-xs"
                            >
                              {txn.status}
                            </Badge>
                          </TableCell>

                          {/* Coverage */}
                          <TableCell>
                            <Badge
                              variant={
                                txn.coverage_state === "matched"
                                  ? "success"
                                  : "outline"
                              }
                              className="text-xs"
                            >
                              {txn.coverage_state || "unmatched"}
                            </Badge>
                          </TableCell>

                          {/* Ignore reason */}
                          <TableCell className="text-sm max-w-[180px] truncate">
                            {txn.ignore_reason || "—"}
                          </TableCell>

                        </TableRow>
                      ))}

                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={12}
                            className="h-32 text-center text-muted-foreground"
                          >
                            No transactions found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Statements tab ── */}
          <TabsContent value="statements" className="mt-4 space-y-4">
            <div className="flex gap-3 items-center flex-wrap">
              <Button onClick={handleCreateStatement} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Statement for {periodLabel(selectedPeriod)}
              </Button>
              {duplicateStatementExists && (
                <Badge variant="secondary" className="text-xs">
                  {periodStatements.length} statement{periodStatements.length !== 1 ? "s" : ""} already exist for this period
                </Badge>
              )}
            </div>

            {statements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm">No statements yet. Import a PDF or create one manually.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...statements].reverse().map((stmt) => (
                  <Card key={stmt.id} className={selectedStatement === stmt.id ? "border-primary" : ""}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">
                            {periodLabel(stmt.period) || stmt.period || "Statement"}
                          </p>
                          {stmt.period === selectedPeriod && (
                            <Badge variant="secondary" className="text-xs">Current period</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {transactions.filter((t) => t.statementId === stmt.id).length} transactions
                          {" · "}Uploaded {formatDate(stmt.uploadedAt)}
                          {stmt.fileName && ` · ${stmt.fileName}`}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant={selectedStatement === stmt.id ? "default" : "outline"}
                          onClick={() => setSelectedStatement(stmt.id)}
                        >
                          {selectedStatement === stmt.id ? "Selected" : "Select"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteStatement(stmt.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Import PDF tab ── */}
          <TabsContent value="import-pdf" className="mt-4 space-y-4">

            {duplicateStatementExists && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {periodStatements.length} statement{periodStatements.length !== 1 ? "s" : ""} already imported for {periodLabel(selectedPeriod)}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  You can import an additional statement (e.g. a second credit card).
                  Avoid importing the same statement twice — it will create duplicate transactions.
                </AlertDescription>
              </Alert>
            )}

            {!pdfFile ? (
              <div
                {...getPDFRootProps()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${isPDFDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }`}
              >
                <input {...getPDFInputProps()} />
                <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium">Drop a PDF statement here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Importing for:{" "}
                  <span className="font-semibold text-foreground">{periodLabel(selectedPeriod)}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Text is extracted from digital PDFs · Scanned PDFs use OCR
                </p>
                <Button variant="outline" size="sm" className="mt-4" type="button">Browse Files</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 shrink-0">
                      <FileText className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(pdfFile.size / 1024).toFixed(0)} KB
                        {" · "}Period: <span className="font-medium text-foreground">{periodLabel(selectedPeriod)}</span>
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!pdfExtracting && pdfRows === null && (
                        <Button size="sm" onClick={handleExtractPDF}>Extract transactions</Button>
                      )}
                      {pdfExtracting && (
                        <Button size="sm" disabled>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Extracting…
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setPdfFile(null); setPdfRows(null); setPdfIssues([]); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {pdfExtracting && (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span>{pdfProgress.label || "Processing…"}</span>
                      </div>
                      <Progress value={pdfProgress.percent} className="h-2" />
                    </CardContent>
                  </Card>
                )}

                {pdfIssues.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Statement extracted, but automatic row parsing requires review</AlertTitle>
                    <AlertDescription className="text-xs space-y-1 mt-1">
                      {pdfIssues.map((issue, i) => <p key={i}>{issue}</p>)}
                    </AlertDescription>
                  </Alert>
                )}

                {pdfRows !== null && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-base">
                          Transaction Preview ({pdfRows.length} rows)
                        </CardTitle>
                        <Button size="sm" variant="outline" onClick={addPreviewRow}>
                          <Plus className="mr-2 h-4 w-4" />Add Row
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Posting Date</TableHead>
                              <TableHead className="text-xs">Description</TableHead>
                              <TableHead className="text-xs text-right">Billed Amount</TableHead>
                              <TableHead className="text-xs">Currency</TableHead>
                              <TableHead className="text-xs">Different Currency</TableHead>
                              <TableHead className="text-xs text-right">Original Amount</TableHead>
                              <TableHead className="text-xs">Original Currency</TableHead>
                              <TableHead className="text-xs text-right">FX Rate</TableHead>
                              <TableHead className="text-xs text-right">Balance</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs">Coverage</TableHead>
                              <TableHead className="w-20" />
                            </TableRow>
                          </TableHeader>

                          <TableBody>
                            {pdfRows.length === 0 && (
                              <TableRow>
                                <TableCell
                                  colSpan={13}
                                  className="h-24 text-center text-muted-foreground text-sm"
                                >
                                  No rows — click &quot;Add Row&quot; to enter transactions manually.
                                </TableCell>
                              </TableRow>
                            )}

                            {pdfRows.map((row) => (
                              <TableRow key={row.id}>

                                <TableCell className="text-xs whitespace-nowrap">
                                  {row.transactionDate || "—"}
                                </TableCell>

                                <TableCell className="text-xs whitespace-nowrap">
                                  {row.postingDate || "—"}
                                </TableCell>

                                <TableCell className="text-xs min-w-[220px] max-w-[300px]">
                                  <div
                                    className="truncate"
                                    title={row.description || ""}
                                  >
                                    {row.description || "—"}
                                  </div>
                                </TableCell>

                                <TableCell className="text-xs text-right font-mono font-semibold whitespace-nowrap">
                                  {row.billedAmount != null
                                    ? Number(row.billedAmount).toFixed(2)
                                    : "—"}
                                </TableCell>

                                <TableCell className="text-xs font-mono">
                                  {row.billedCurrency || "—"}
                                </TableCell>

                                <TableCell className="text-xs font-mono">
                                  {row.originalCurrency &&
                                    row.originalCurrency !== row.billedCurrency
                                    ? "Yes"
                                    : "No"}
                                </TableCell>

                                <TableCell className="text-xs text-right font-mono whitespace-nowrap">
                                  {row.originalAmount != null
                                    ? Number(row.originalAmount).toFixed(2)
                                    : "—"}
                                </TableCell>

                                <TableCell className="text-xs font-mono">
                                  {row.originalCurrency || "—"}
                                </TableCell>

                                <TableCell className="text-xs text-right font-mono">
                                  {row.statementFxRate != null
                                    ? Number(row.statementFxRate).toFixed(6)
                                    : "—"}
                                </TableCell>

                                <TableCell className="text-xs text-right font-mono whitespace-nowrap">
                                  {row.balance != null
                                    ? Number(row.balance).toFixed(2)
                                    : "—"}
                                </TableCell>

                                <TableCell>
                                  <Badge
                                    variant={
                                      row.status === "matched"
                                        ? "success"
                                        : row.status === "ignored"
                                          ? "secondary"
                                          : "outline"
                                    }
                                    className="text-xs"
                                  >
                                    {row.status || "unmatched"}
                                  </Badge>
                                </TableCell>

                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {row.coverageState || "unmatched"}
                                  </Badge>
                                </TableCell>

                                <TableCell className="p-1">
                                  <div className="flex gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => setEditingRow(row)}
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </Button>

                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => removePreviewRow(row.id)}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>

                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {pdfRows !== null && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <p className="text-sm font-medium">
                          Importing statement for:{" "}
                          <span className="font-bold">{periodLabel(selectedPeriod)}</span>
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        To change the accounting period, use the period selector at the top of the page.
                        The transaction dates within the statement are preserved separately.
                      </p>
                      <Button
                        onClick={handleConfirmPDFImport}
                        disabled={isConfirming || pdfRows.length === 0}
                      >
                        {isConfirming ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing…</>
                        ) : (
                          <><CheckCircle2 className="mr-2 h-4 w-4" />Confirm Import ({pdfRows.length} rows)</>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Transactions are saved only after you click Confirm.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {pdfRows !== null && pdfExtractedText && pdfRows.length === 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Extracted Text (for reference)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-64 overflow-auto font-mono bg-muted/30 rounded p-2">
                        {pdfExtractedText.slice(0, 3000)}
                        {pdfExtractedText.length > 3000 ? "\n…(truncated)" : ""}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Import CSV tab ── */}
          <TabsContent value="import-csv" className="mt-4 space-y-4">
            {importError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Import Error</AlertTitle>
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}
            <div
              {...getCSVRootProps()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${isCSVDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
            >
              <input {...getCSVInputProps()} />
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">Drop your CSV file here</p>
              <p className="text-sm text-muted-foreground mt-1">
                Supports CSV exports from major banks and card providers
              </p>
              <Button variant="outline" size="sm" className="mt-4" type="button">Browse Files</Button>
            </div>

            {importPreview.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base">Preview ({importPreview.length} rows)</CardTitle>
                    <div className="flex gap-2 items-center">
                      <Button variant="outline" size="sm" onClick={() => setImportPreview([])}>Cancel</Button>
                      {periodStatements.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Create a statement first (Statements tab)</span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleImportCSV(selectedStatement ?? periodStatements[periodStatements.length - 1].id)}
                          disabled={isImporting}
                        >
                          {isImporting
                            ? "Importing…"
                            : <><CheckCircle2 className="mr-2 h-4 w-4" />Import to {periodLabel(selectedPeriod)}</>}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          {Object.keys(importPreview[0]).slice(0, 6).map((k) => (
                            <TableHead key={k} className="text-xs">{k}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {Object.values(row).slice(0, 6).map((val, j) => (
                              <TableCell key={j} className="text-xs">{String(val)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                        {importPreview.length > 5 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-xs text-center text-muted-foreground">
                              … and {importPreview.length - 5} more rows
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <h4 className="text-sm font-medium mb-2">Expected CSV columns</h4>
                <p className="text-xs text-muted-foreground">
                  <code className="bg-muted px-1 rounded">date</code>,{" "}
                  <code className="bg-muted px-1 rounded">description</code>,{" "}
                  <code className="bg-muted px-1 rounded">amount</code>,{" "}
                  <code className="bg-muted px-1 rounded">currency</code>{" "}
                  — column names may vary; common bank formats are handled automatically.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <EditRowDialog
        row={editingRow}
        open={!!editingRow}
        onClose={() => setEditingRow(null)}
        onSave={(updated) => updatePreviewRow(updated.id, updated)}
      />
    </div>
  );
}
