"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, Upload, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { documentService } from "@/services/document.service";
import { expenseService } from "@/services/expense.service";
import { transactionService } from "@/services/transaction.service";
import { reconciliationService } from "@/services/reconciliation.service";
import { formatCurrency, formatDate } from "@/lib/utils";

import { documentRepository } from "@/services/backend-documents";
import { expenseRepository } from "@/services/backend-expenses";
import { transactionRepository } from "@/services/backend-transaction";


function StatCard({ icon: Icon, label, value, color, href }) {
  const card = (
    <Card className={href ? "hover:border-primary/50 transition-colors cursor-pointer" : ""}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

export default function DashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function loadDashboard() {
      try {

        // Documents are filtered by the backend.
        const [
          documents,
          pendingReview,
          expenses,
          transactions,
        ] = await Promise.all([
          documentRepository.getAll(),
          documentRepository.getAll({
            status: "pending_review",
          }),
          expenseRepository.getAll(),
          transactionRepository.getAll(),
        ]);

        // Reconciliation is frontend-only.
        const matches =
          reconciliationService.getConfirmed();

        // Approved credit-card expenses.
        // Expense filtering can also be moved to the backend
        // once the expense repository supports those filters.
        const ccExpenses = expenses.filter(
          (e) =>
            e.status === "approved" &&
            (e.paymentMethod ?? e.payment_method) ===
            "credit_card"
        );

        // Transaction filtering can also be moved to the backend
        // once the transaction repository supports status filters.
        const unmatchedTxns = transactions.filter(
          (t) => t.status === "unmatched"
        );

        const missingReceipts =
          unmatchedTxns.length;

        const suggestedCandidates =
          reconciliationService.generateCandidates(
            ccExpenses,
            transactions
          );


        // ─────────────────────────────────────────────
        // ATTENTION ITEMS
        // ─────────────────────────────────────────────

        const attentionItems = [
          ...pendingReview
            .slice(0, 3)
            .map((d) => ({
              id: d.id,

              label:
                d.file_name ??
                d.fileName ??
                "Unnamed document",

              detail: "Needs review",

              type: "review",

              href:
                `/documents/review/${d.id}`,
            })),

          ...unmatchedTxns
            .slice(0, 3)
            .map((t) => ({
              id: t.id,

              label:
                t.description ??
                "Unknown transaction",

              detail:
                `${formatCurrency(
                  Math.abs(
                    t.billed_amount ??
                    t.billedAmount ??
                    0
                  ),
                  t.billed_currency ??
                  t.billedCurrency
                )} — Missing receipt`,

              type: "missing",

              href: "/reconciliation",
            })),

          ...suggestedCandidates
            .slice(0, 2)
            .map((c) => ({
              id: c.expenseId,

              label:
                c.expense?.vendor_name ??
                c.expense?.vendorName ??
                "Unknown vendor",

              detail:
                `${formatCurrency(
                  c.expense?.gross_amount ??
                  c.expense?.grossAmount ??
                  0,
                  c.expense?.currency
                )} — Suggested match`,

              type: "match",

              href: "/reconciliation",
            })),
        ].slice(0, 6);


        // ─────────────────────────────────────────────
        // RECENT EXPENSES
        // ─────────────────────────────────────────────

        const recentExpenses = [...expenses]
          .sort(
            (a, b) =>
              new Date(
                b.created_at ??
                b.createdAt
              ) -
              new Date(
                a.created_at ??
                a.createdAt
              )
          )
          .slice(0, 5);


        // ─────────────────────────────────────────────
        // DASHBOARD DATA
        // ─────────────────────────────────────────────

        setData({
          pendingReview:
            pendingReview.length,

          totalDocuments:
            documents.length,

          approvedExpenses:
            expenses.filter(
              (e) => e.status === "approved"
            ).length,

          missingReceipts,

          suggestedMatches:
            suggestedCandidates.filter(
              (c) =>
                c.matchType ===
                "strong_candidate"
            ).length,

          matched:
            matches.length,

          totalCcTxns:
            transactions.length,

          attentionItems,

          recentExpenses,
        });

      } catch (err) {

        console.error(
          "Failed to load dashboard:",
          err
        );

      }
    }

    loadDashboard();

  }, []);

  if (!data) return null;

  const now = new Date();
  const period = now.toLocaleString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        description={period}
        actions={
          <Button asChild size="sm">
            <Link href="/documents/upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload Document
            </Link>
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Clock}
            label="Needs Review"
            value={data.pendingReview}
            color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            href="/documents/review"
          />
          <StatCard
            icon={AlertTriangle}
            label="Missing Receipts"
            value={data.missingReceipts}
            color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            href="/reconciliation"
          />
          <StatCard
            icon={CreditCard}
            label="Suggested Matches"
            value={data.suggestedMatches}
            color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            href="/reconciliation"
          />
          <StatCard
            icon={CheckCircle2}
            label={`Matched (${data.totalCcTxns} total)`}
            value={`${data.matched} / ${data.totalCcTxns}`}
            color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            href="/reconciliation"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Requires Attention */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Requires Attention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.attentionItems.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                  <p className="text-sm">Everything is up to date</p>
                </div>
              ) : (
                data.attentionItems.map((item) => (
                  <Link key={item.id} href={item.href}>
                    <div className="flex items-center gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${item.type === "review" ? "bg-yellow-500" :
                        item.type === "missing" ? "bg-red-500" : "bg-blue-500"
                        }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Expenses */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Expenses</CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs">
                <Link href="/expenses">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentExpenses.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <p className="text-sm">No expenses yet</p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href="/documents/upload">Upload your first document</Link>
                  </Button>
                </div>
              ) : (
                data.recentExpenses.map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{exp.vendorName || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(exp.documentDate)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-sm font-semibold">{formatCurrency(exp.grossAmount, exp.currency)}</p>
                      <Badge variant={exp.status === "approved" ? "success" : exp.status === "draft" ? "secondary" : "destructive"} className="text-xs">
                        {exp.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
