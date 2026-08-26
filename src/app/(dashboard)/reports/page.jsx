"use client";
import React, { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, AlertTriangle, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodSelector } from "@/components/layout/period-selector";
import { expenseService } from "@/services/expense.service";
import { transactionService } from "@/services/transaction.service";
import { reconciliationService } from "@/services/reconciliation.service";
import { statementService } from "@/services/statement.service";
import { settingsService } from "@/services/settings.service";
import { formatCurrency, buildPeriod, periodLabel } from "@/lib/utils";
import { usePeriodStore } from "@/store/period";
import ExpenseLedger from "./ExpenseLedger";

import { expenseRepository } from "@/services/backend-expenses";
import { expenseLedgerRepository } from "@/services/backend-expense-ledger";
import { transactionRepository } from "@/services/backend-transactions";

function StatRow({ label, value, sub }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="text-right">
        <p className="text-sm font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function OverviewTab() {
  const { month, year, setPeriod: setStorePeriod } = usePeriodStore();
  const period = buildPeriod(year, month);

  const [report, setReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [exporting, setExporting] = useState(null); // 'excel' | 'pdf' | null
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState(null);

  useEffect(() => {
    async function loadReport() {
      try {
        const [
          allExpenses,
          allTxns,
          expenseLedger,
        ] = await Promise.all([
          expenseRepository.getAll({ period }),
          transactionRepository.getAll(),
          expenseLedgerRepository.getAll({ period }),
        ]);

        const confirmed = reconciliationService.getConfirmed();

        // ─────────────────────────────────────────────
        // EXPENSES
        // Backend fields:
        // status, payment_method, gross_amount, vat_amount
        // ─────────────────────────────────────────────

        const approvedExpenses = allExpenses.filter(
          (e) => e.status === "approved"
        );

        const draftExpenses = allExpenses.filter(
          (e) => e.status === "draft"
        );

        const ccExpenses = approvedExpenses.filter(
          (e) => e.payment_method === "credit_card"
        );

        const nonCcExpenses = approvedExpenses.filter(
          (e) =>
            e.payment_method &&
            e.payment_method !== "credit_card"
        );


        // ─────────────────────────────────────────────
        // CONFIRMED MATCHES
        // reconciliationService still uses frontend names
        // ─────────────────────────────────────────────

        const matchedExpenseIds = new Set(
          confirmed.map((m) => m.expenseId)
        );

        const matchedTxnIds = new Set(
          confirmed.map((m) => m.transactionId)
        );

        const ccExpensesWithoutCharge = ccExpenses.filter(
          (e) => !matchedExpenseIds.has(e.id)
        );


        // ─────────────────────────────────────────────
        // STATEMENTS
        //
        // Expense ledger SQL returns:
        // linked_statement_id
        //
        // NOT: id
        // ─────────────────────────────────────────────

        const periodStmtIds = new Set(
          expenseLedger
            .map((row) => row.linked_statement_id)
            .filter(Boolean)
        );


        // ─────────────────────────────────────────────
        // TRANSACTIONS
        //
        // Backend transaction field:
        // statement_id
        // ─────────────────────────────────────────────

        const periodTxns = allTxns.filter(
          (t) => periodStmtIds.has(t.statement_id)
        );

        const unmatchedTxns = periodTxns.filter(
          (t) =>
            !matchedTxnIds.has(t.id) &&
            t.status !== "ignored"
        );


        // ─────────────────────────────────────────────
        // TOTALS
        // PostgreSQL NUMERIC values may arrive as strings,
        // so explicitly convert them to numbers.
        // ─────────────────────────────────────────────

        const totalGross = approvedExpenses.reduce(
          (sum, e) =>
            sum + Number(e.gross_amount ?? 0),
          0
        );

        const totalVat = approvedExpenses.reduce(
          (sum, e) =>
            sum + Number(e.vat_amount ?? 0),
          0
        );


        // ─────────────────────────────────────────────
        // READY CHECK
        // ─────────────────────────────────────────────

        const isReady =
          draftExpenses.length === 0 &&
          unmatchedTxns.length === 0 &&
          ccExpensesWithoutCharge.length === 0;


        const settings = settingsService.get();


        // ─────────────────────────────────────────────
        // REPORT SUMMARY
        // ─────────────────────────────────────────────

        setReport({
          totalExpenses: allExpenses.length,

          approvedExpenses: approvedExpenses.length,

          draftExpenses: draftExpenses.length,

          totalGross,

          totalVat,

          ccExpenses: ccExpenses.length,

          matchedCC: ccExpenses.filter(
            (e) => matchedExpenseIds.has(e.id)
          ).length,

          periodTxns: periodTxns.length,

          matchedTxns: periodTxns.filter(
            (t) => matchedTxnIds.has(t.id)
          ).length,

          unmatchedTxns: unmatchedTxns.length,

          ccExpensesWithoutCharge:
            ccExpensesWithoutCharge.length,

          statements: periodStmtIds.size,

          isReady,
        });


        // ─────────────────────────────────────────────
        // REPORT DATA
        // ─────────────────────────────────────────────

        setReportData({
          period,

          periodLabel: periodLabel(period),

          companyName:
            settings?.companyName ?? "Company",

          expenses: allExpenses,

          transactions: periodTxns,


          // Confirmed matches that belong to this period
          confirmedMatches: confirmed.filter((m) => {
            const transaction = allTxns.find(
              (t) => t.id === m.transactionId
            );

            return (
              periodStmtIds.has(
                transaction?.statement_id
              )
            );
          }),


          unmatchedTxns,

          expensesWithoutCharge:
            ccExpensesWithoutCharge,

          nonCcExpenses,
        });

      } catch (error) {

        console.error(
          "Failed to load report:",
          error
        );

      }
    }

    loadReport();

  }, [period]);

  async function handleExcelExport() {
    if (!reportData) return;
    setExporting("excel");
    setExportError(null);
    try {
      const { exportToExcel } = await import("@/services/report/excel-exporter");
      await exportToExcel(reportData);
    } catch (err) {
      console.error("Excel export failed:", err);
      setExportError("Excel export failed: " + err.message);
    } finally {
      setExporting(null);
    }
  }

  async function handlePDFExport() {
    if (!reportData) return;
    setExporting("pdf");
    setExportProgress(0);
    setExportError(null);
    try {
      const { exportToPDF } = await import("@/services/report/pdf-reporter");
      await exportToPDF(reportData, (pct) => setExportProgress(pct));
    } catch (err) {
      console.error("PDF export failed:", err);
      setExportError("PDF export failed: " + err.message);
    } finally {
      setExporting(null);
      setExportProgress(0);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Period selector */}
      <div className="flex items-center gap-4 flex-wrap rounded-lg border bg-muted/30 px-4 py-2.5">
        <PeriodSelector
          month={month}
          year={year}
          onChange={setStorePeriod}
          label="Report Period"
        />
      </div>

      {report && (
        <>
          {/* Readiness banner */}
          <Card className={report.isReady ? "border-green-400 bg-green-50 dark:bg-green-900/20" : "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"}>
            <CardContent className="p-4 flex items-center gap-3">
              {report.isReady ? (
                <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-yellow-600 flex-shrink-0" />
              )}
              <div>
                <p className="font-semibold text-sm">
                  {report.isReady ? "READY FOR ACCOUNTANT" : "NOT READY FOR ACCOUNTANT"}
                </p>
                {!report.isReady && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {report.draftExpenses > 0 && `${report.draftExpenses} draft expense(s) pending. `}
                    {report.unmatchedTxns > 0 && `${report.unmatchedTxns} transaction(s) missing receipts. `}
                    {report.ccExpensesWithoutCharge > 0 && `${report.ccExpensesWithoutCharge} CC expense(s) without card charge.`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Expenses */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <StatRow label="Total expenses" value={report.totalExpenses} />
                <StatRow label="Approved" value={report.approvedExpenses} />
                <StatRow label="Draft (pending)" value={report.draftExpenses} />
                <StatRow label="Total gross" value={formatCurrency(report.totalGross, "ILS")} />
                <StatRow label="Total VAT" value={formatCurrency(report.totalVat, "ILS")} />
              </CardContent>
            </Card>

            {/* Credit card reconciliation */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Credit Card Reconciliation</CardTitle>
              </CardHeader>
              <CardContent>
                <StatRow
                  label="CC expenses"
                  value={`${report.matchedCC} / ${report.ccExpenses}`}
                  sub="matched"
                />
                <StatRow
                  label="CC transactions"
                  value={`${report.matchedTxns} / ${report.periodTxns}`}
                  sub="matched"
                />
                <StatRow label="Missing receipts" value={report.unmatchedTxns} />
                <StatRow label="CC expenses without charge" value={report.ccExpensesWithoutCharge} />
                <StatRow label="Statements" value={report.statements} />
              </CardContent>
            </Card>
          </div>

          {/* Export */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Export Accountant Package
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Export all data for the selected period. The Excel workbook contains Summary, Expenses, CC Transactions, and Reconciliation sheets. The PDF report embeds original receipt/invoice images.
              </p>

              {exportError && (
                <p className="text-xs text-red-500">{exportError}</p>
              )}

              {exporting === "pdf" && exportProgress > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Generating PDF… {exportProgress}%</p>
                  <Progress value={exportProgress} className="h-1.5" />
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExcelExport}
                  disabled={!!exporting}
                >
                  {exporting === "excel" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                  )}
                  Export Excel (.xlsx)
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePDFExport}
                  disabled={!!exporting}
                >
                  {exporting === "pdf" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Export PDF Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Reports"
        description="Monthly financial summary"
      />

      <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
        <div className="px-6 pt-4 flex-shrink-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="expense-ledger">Expense Ledger</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="overview"
          className="flex-1 min-h-0 overflow-auto mt-0"
        >
          <OverviewTab />
        </TabsContent>

        <TabsContent
          value="expense-ledger"
          className="flex-1 min-h-0 overflow-auto mt-0 px-6 py-4"
        >
          <ExpenseLedger />
        </TabsContent>
      </Tabs>
    </div>
  );
}
