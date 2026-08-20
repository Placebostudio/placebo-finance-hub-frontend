"use client";
import React, { useEffect, useState } from "react";
import {
  GitMerge, CheckCircle2, AlertTriangle, Link2, Link2Off, Undo2, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/page-header";
import { expenseService } from "@/services/expense.service";
import { transactionService } from "@/services/transaction.service";
import { statementService } from "@/services/statement.service";
import { reconciliationService } from "@/services/reconciliation.service";
import { formatCurrency, formatDate, buildPeriod, periodLabel } from "@/lib/utils";
import { PeriodSelector } from "@/components/layout/period-selector";
import { usePeriodStore } from "@/store/period";
import { toast } from "sonner";

// ── Sub-components ─────────────────────────────────────────────────────────────
function MatchTypeConfig(type) {
  return {
    strong_candidate:   { label: "Strong Candidate",   variant: "success" },
    possible_candidate: { label: "Possible Candidate", variant: "warning" },
    manual:             { label: "Manual",              variant: "secondary" },
  }[type] ?? { label: type, variant: "outline" };
}

function CandidateCard({ candidate, onConfirm, onReject }) {
  const cfg = MatchTypeConfig(candidate.matchType);
  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
            <span className="text-sm font-bold">{candidate.score}%</span>
            <span className="text-xs text-muted-foreground">score</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
              {candidate.reasons.map((r) => (
                <span key={r} className="text-xs text-muted-foreground">· {r}</span>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded bg-muted/50 p-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">EXPENSE</p>
                <p className="font-medium truncate">{candidate.expense.vendorName || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(candidate.expense.documentDate)} · {formatCurrency(candidate.expense.grossAmount ?? 0, candidate.expense.currency)}
                </p>
              </div>
              <div className="rounded bg-muted/50 p-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">TRANSACTION</p>
                <p className="font-medium truncate">{candidate.transaction.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(candidate.transaction.transactionDate)} · {formatCurrency(Math.abs(candidate.transaction.billedAmount ?? candidate.transaction.originalAmount ?? 0), candidate.transaction.billedCurrency)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button size="sm" onClick={() => onConfirm(candidate)}>
              <Link2 className="mr-2 h-4 w-4" />Confirm
            </Button>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onReject(candidate)}>
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchedCard({ match, expense, transaction, onUndo }) {
  return (
    <Card className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="rounded bg-muted/30 p-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">EXPENSE</p>
              <p className="font-medium truncate">{expense?.vendorName || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(expense?.documentDate)} · {formatCurrency(expense?.grossAmount ?? 0, expense?.currency ?? "ILS")}
              </p>
            </div>
            <div className="rounded bg-muted/30 p-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">TRANSACTION</p>
              <p className="font-medium truncate">{transaction?.description || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(transaction?.transactionDate)} · {formatCurrency(Math.abs(transaction?.billedAmount ?? 0), transaction?.billedCurrency ?? "ILS")}
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground" onClick={() => onUndo(match.id)}>
            <Undo2 className="mr-1 h-3.5 w-3.5" />Undo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReconciliationPage() {
  const { month: periodMonth, year: periodYear, setPeriod } = usePeriodStore();
  const period = buildPeriod(periodYear, periodMonth);

  const [data, setData]   = useState(null);
  const [search, setSearch] = useState("");

  function load() {
    // Scope to selected accounting period
    const periodStmts  = statementService.getByPeriod(period);
    const periodStmtIds = new Set(periodStmts.map((s) => s.id));

    // CC expenses whose documentDate falls in this period
    const ccExpenses = expenseService.getApprovedCreditCardByPeriod(period);

    // Transactions imported under this period's statements
    const periodTxns = transactionService.getByStatementIds([...periodStmtIds]);

    const allExpenses         = expenseService.getAll();
    const allConfirmedMatches = reconciliationService.getConfirmed();

    // Only show confirmed matches where BOTH sides belong to this period
    const periodExpenseIds = new Set(ccExpenses.map((e) => e.id));
    const periodTxnIds     = new Set(periodTxns.map((t) => t.id));
    const confirmedMatches = allConfirmedMatches.filter(
      (m) => periodExpenseIds.has(m.expenseId) && periodTxnIds.has(m.transactionId)
    );

    const candidates = reconciliationService.generateCandidates(ccExpenses, periodTxns);

    const matchedExpenseIds = new Set(confirmedMatches.map((m) => m.expenseId));
    const matchedTxnIds     = new Set(confirmedMatches.map((m) => m.transactionId));

    const unmatchedTxns       = periodTxns.filter((t) => !matchedTxnIds.has(t.id) && t.status !== "ignored");
    const expensesWithoutCharge = ccExpenses.filter((e) => !matchedExpenseIds.has(e.id));

    // Non-CC expenses for this period (cash, bank — not shown in reconciliation but count for awareness)
    const nonCcExpenses = allExpenses.filter(
      (e) =>
        e.status === "approved" &&
        e.paymentMethod !== "credit_card" &&
        e.documentDate &&
        e.documentDate.startsWith(period)
    );

    const enrichedMatches = confirmedMatches.map((m) => ({
      match: m,
      expense:     allExpenses.find((e) => e.id === m.expenseId),
      transaction: periodTxns.find((t) => t.id === m.transactionId),
    }));

    setData({
      candidates,
      enrichedMatches,
      unmatchedTxns,
      expensesWithoutCharge,
      nonCcExpenses,
      totalTxns: periodTxns.length,
      hasStatements: periodStmts.length > 0,
    });
  }

  // Reload whenever period changes
  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleConfirm(candidate) {
    reconciliationService.confirmMatch(
      candidate.expenseId, candidate.transactionId,
      candidate.matchType, candidate.score, candidate.reasons
    );
    toast.success("Match confirmed");
    load();
  }

  function handleReject(candidate) {
    reconciliationService.rejectCandidate(candidate.expenseId, candidate.transactionId);
    toast.info("Match rejected");
    load();
  }

  function handleUndo(matchId) {
    reconciliationService.undoMatch(matchId);
    toast.info("Match undone");
    load();
  }

  if (!data) return null;

  const matchedCount     = data.enrichedMatches.length;
  const matchRate        = data.totalTxns > 0 ? Math.round((matchedCount / data.totalTxns) * 100) : 0;
  const strongCandidates = data.candidates.filter((c) => c.matchType === "strong_candidate");
  const possibleCandidates = data.candidates.filter((c) => c.matchType === "possible_candidate");

  const filteredUnmatched = data.unmatchedTxns.filter(
    (t) => !search || t.description.toLowerCase().includes(search.toLowerCase())
  );
  const filteredNoCharge = data.expensesWithoutCharge.filter(
    (e) => !search || (e.vendorName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Reconciliation"
        description="Match expense records against credit card transactions"
      />

      <div className="flex-1 p-6 space-y-4 overflow-auto">

        {/* ── Period selector ── */}
        <div className="flex items-center gap-4 flex-wrap rounded-lg border bg-muted/30 px-4 py-2.5">
          <PeriodSelector
            month={periodMonth}
            year={periodYear}
            onChange={(m, y) => { setPeriod(m, y); setSearch(""); }}
            label="Reconciliation Period"
          />
          {!data.hasStatements && (
            <span className="text-xs text-muted-foreground">
              No statement imported for {periodLabel(period)} — import one via Transactions → Import PDF
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-xl font-bold">{matchedCount}</p>
                <p className="text-xs text-muted-foreground">Matched</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <GitMerge className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-xl font-bold">{strongCandidates.length}</p>
                <p className="text-xs text-muted-foreground">Strong</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <GitMerge className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-xl font-bold">{possibleCandidates.length}</p>
                <p className="text-xs text-muted-foreground">Possible</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-xl font-bold">{data.unmatchedTxns.length}</p>
                <p className="text-xs text-muted-foreground">Missing receipt</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted-foreground">Match rate</p>
                <span className="text-sm font-bold">{matchRate}%</span>
              </div>
              <Progress value={matchRate} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{matchedCount} / {data.totalTxns}</p>
            </CardContent>
          </Card>
        </div>

        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Tabs defaultValue="candidates">
          <TabsList>
            <TabsTrigger value="candidates">Suggestions ({data.candidates.length})</TabsTrigger>
            <TabsTrigger value="matched">Matched ({matchedCount})</TabsTrigger>
            <TabsTrigger value="missing">Missing Receipts ({data.unmatchedTxns.length})</TabsTrigger>
            <TabsTrigger value="unmatched">No Card Charge ({data.expensesWithoutCharge.length})</TabsTrigger>
          </TabsList>

          {/* Candidates */}
          <TabsContent value="candidates" className="mt-4 space-y-3">
            {strongCandidates.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Strong Candidates</p>
                {strongCandidates
                  .filter((c) => !search ||
                    c.expense.vendorName?.toLowerCase().includes(search.toLowerCase()) ||
                    c.transaction.description.toLowerCase().includes(search.toLowerCase()))
                  .map((c) => (
                    <CandidateCard key={`${c.expenseId}-${c.transactionId}`} candidate={c} onConfirm={handleConfirm} onReject={handleReject} />
                  ))}
              </>
            )}
            {possibleCandidates.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mt-4">Possible Candidates</p>
                {possibleCandidates
                  .filter((c) => !search ||
                    c.expense.vendorName?.toLowerCase().includes(search.toLowerCase()) ||
                    c.transaction.description.toLowerCase().includes(search.toLowerCase()))
                  .map((c) => (
                    <CandidateCard key={`${c.expenseId}-${c.transactionId}`} candidate={c} onConfirm={handleConfirm} onReject={handleReject} />
                  ))}
              </>
            )}
            {data.candidates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <GitMerge className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">
                  {data.hasStatements
                    ? "No suggestions — upload receipts matching the imported transactions"
                    : `No statement imported for ${periodLabel(period)} yet`}
                </p>
              </div>
            )}
          </TabsContent>

          {/* Matched */}
          <TabsContent value="matched" className="mt-4 space-y-3">
            {data.enrichedMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No confirmed matches for {periodLabel(period)}</p>
              </div>
            ) : (
              data.enrichedMatches
                .filter((m) =>
                  !search ||
                  m.expense?.vendorName?.toLowerCase().includes(search.toLowerCase()) ||
                  m.transaction?.description?.toLowerCase().includes(search.toLowerCase()))
                .map(({ match, expense, transaction }) => (
                  <MatchedCard key={match.id} match={match} expense={expense} transaction={transaction} onUndo={handleUndo} />
                ))
            )}
          </TabsContent>

          {/* Missing receipts (CC txns without expense) */}
          <TabsContent value="missing" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              {periodLabel(period)} credit card transactions with no matched expense record
            </p>
            {filteredUnmatched.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3 text-green-500 opacity-60" />
                <p className="text-sm">All transactions have receipts</p>
              </div>
            ) : (
              filteredUnmatched.map((txn) => (
                <Card key={txn.id} className="border-red-200 dark:border-red-900">
                  <CardContent className="p-4 flex items-center gap-4">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{txn.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(txn.transactionDate)}{txn.cardLastFour ? ` · ••••${txn.cardLastFour}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatCurrency(Math.abs(txn.billedAmount ?? txn.originalAmount ?? 0), txn.billedCurrency)}</p>
                      <Badge variant="destructive" className="text-xs">Missing Receipt</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Expenses without card charge */}
          <TabsContent value="unmatched" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Approved credit-card expenses for {periodLabel(period)} with no matching transaction.
              Cash and bank-transfer expenses do NOT appear here.
            </p>
            {filteredNoCharge.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-3 text-green-500 opacity-60" />
                <p className="text-sm">All CC expenses have a matching transaction</p>
              </div>
            ) : (
              filteredNoCharge.map((exp) => (
                <Card key={exp.id} className="border-yellow-200 dark:border-yellow-900">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Link2Off className="h-5 w-5 text-yellow-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{exp.vendorName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(exp.documentDate)} · {exp.documentNumber}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatCurrency(exp.grossAmount ?? 0, exp.currency)}</p>
                      <Badge variant="warning" className="text-xs">No Card Charge</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
