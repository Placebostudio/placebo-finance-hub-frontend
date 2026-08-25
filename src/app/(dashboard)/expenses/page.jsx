"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Receipt, Search, Trash2, CreditCard, Landmark, Banknote, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodSelector } from "@/components/layout/period-selector";
import { expenseService } from "@/services/expense.service";
import { auditService } from "@/services/audit.service";
import { fetchFxRates, convertCurrency } from "@/services/fx.service";
import { usePeriodStore } from "@/store/period";
import { useAuthStore } from "@/store/auth";
import { APP_CONFIG } from "@/config";
import { formatCurrency, formatDate, buildPeriod, periodLabel } from "@/lib/utils";
import { toast } from "sonner";

import { expenseRepository } from "@/services/backend-expenses";
import { auditRepository } from "@/services/backend-audits";
import { categoryRepository } from "@/services/backend-categories";
import { currencyRepository } from "@/services/backend-currencies";

const STATUS_VARIANTS = { approved: "success", draft: "secondary", rejected: "destructive" };
const METHOD_ICONS = { credit_card: CreditCard, bank_transfer: Landmark, cash: Banknote };

export default function ExpensesPage() {
  const { month, year, setPeriod } = usePeriodStore();
  const period = buildPeriod(year, month);
  const { user: currentUser } = useAuthStore();

  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [displayCurrency, setDisplayCurrency] = useState("ILS");
  const [fxData, setFxData] = useState(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState(false);

  async function load() {
    const expenses = await expenseRepository.getAll();
    const categories = await categoryRepository.getAll();

    const expensesWithCategories = expenses.map((expense) => {
      const category = categories.find(
        (c) => c.id === expense.category_id
      );

      return {
        ...expense,
        category: category?.name ?? "Uncategorized",
      };
    });

    setExpenses(expensesWithCategories);
  }
  useEffect(() => { load(); }, []);

  console.log(expenses)

  // Fetch FX rates on mount
  useEffect(() => {
    setFxLoading(true);
    setFxError(false);
    fetchFxRates()
      .then((data) => {
        setFxData(data);
        if (!data) setFxError(true);
      })
      .catch(() => setFxError(true))
      .finally(() => setFxLoading(false));
  }, []);

  function handlePeriodChange(m, y) {
    setPeriod(m, y);
    setSearch("");
    setStatusFilter("all");
  }

  const periodExpenses = expenses.filter(
    (e) => e.document_date && e.document_date.startsWith(period)
  );

  const filtered = periodExpenses.filter((e) => {
    const matchSearch =
      !search ||
      (e.vendorName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.documentNumber ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Multi-currency totals ─────────────────────────────────────────────────
  // 1. Compute approved expenses only
  const approvedExpenses = filtered.filter((e) => e.status === "approved");

  // 2. Per-currency breakdown (original amounts)
  const currencyBreakdown = approvedExpenses.reduce((acc, e) => {
    const cur = e.currency ?? "ILS";
    if (!acc[cur]) acc[cur] = { gross: 0, vat: 0 };
    acc[cur].gross += e.gross_amount ?? 0;
    acc[cur].vat += e.vat_amount ?? 0;
    return acc;
  }, {});

  // 3. Converted total in display currency
  // null = incomplete (some expenses couldn't be converted)
  let convertedTotal = 0;
  let convertedVat = 0;
  let conversionIncomplete = false;
  let conversionUnavailable = fxError;

  if (!fxError) {
    for (const e of approvedExpenses) {
      const gross = e.gross_amount ?? 0;
      const vat = e.vat_amount ?? 0;
      const cur = e.currency ?? "ILS";

      if (cur === displayCurrency) {
        convertedTotal += gross;
        convertedVat += vat;
      } else {
        const convertedGross = convertCurrency(gross, cur, displayCurrency, fxData);
        const convertedVatAmt = convertCurrency(vat, cur, displayCurrency, fxData);
        if (convertedGross == null || convertedVatAmt == null) {
          conversionIncomplete = true;
        } else {
          convertedTotal += convertedGross;
          convertedVat += convertedVatAmt;
        }
      }
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this expense?")) return;

    try {
      const exp = await expenseRepository.getById(id);

      if (!exp) {
        toast.error("Expense not found");
        return;
      }

      if (currentUser?.role === "owner") {
        // Hard delete
        await expenseRepository.delete(id);

        await auditRepository.create({
          actor_id: currentUser.id,
          action: "delete",
          entity_type: "expense",
          entity_id: id,
          details: {
            before: exp,
            after: null,
          },
        });

        toast.success("Expense permanently deleted");
      } else {
        // Soft delete = just update spam
        const updatedExpense = await expenseRepository.update(id, {
          spam: true,
        });

        await auditRepository.create({
          actor_id: currentUser?.id,
          action: "soft_delete",
          entity_type: "expense",
          entity_id: id,
          details: {
            before: exp,
            after: updatedExpense,
          },
        });

        toast.success("Expense deleted");
      }

      load();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to delete expense");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Expenses"
        description={`${periodExpenses.length} expense record${periodExpenses.length !== 1 ? "s" : ""} · ${periodLabel(period)}`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/documents/upload">Upload Document</Link>
          </Button>
        }
      />

      <div className="flex-1 p-4 sm:p-6 space-y-4 overflow-auto">

        {/* Period selector bar */}
        <div className="flex items-center gap-4 flex-wrap rounded-lg border bg-muted/30 px-4 py-2.5">
          <PeriodSelector month={month} year={year} onChange={handlePeriodChange} label="Expenses Period" />
        </div>

        {/* Filters + Display Currency */}
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendor, invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Display currency:</span>
            <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_CONFIG.supportedCurrencies.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Receipt className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">{search || statusFilter !== "all" ? "No expenses match your filter" : `No expenses for ${periodLabel(period)}`}</p>
          </div>
        ) : (
          <>
            {/* Approved totals summary */}
            {approvedExpenses.length > 0 && (
              <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
                {/* Converted total */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-muted-foreground">Approved total ({displayCurrency}):</span>
                  {conversionUnavailable ? (
                    <span className="flex items-center gap-1 text-sm text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      FX rates unavailable — totals not converted
                    </span>
                  ) : fxLoading ? (
                    <span className="text-sm text-muted-foreground">Loading rates…</span>
                  ) : conversionIncomplete ? (
                    <span className="flex items-center gap-1 text-sm text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {formatCurrency(convertedTotal, displayCurrency)}
                      <span className="text-xs ml-1">(partial — some rates unavailable)</span>
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold">{formatCurrency(convertedTotal, displayCurrency)}</span>
                      <span className="text-muted-foreground text-sm">incl. VAT {formatCurrency(convertedVat, displayCurrency)}</span>
                    </>
                  )}
                </div>
                {/* Original-currency breakdown */}
                {Object.keys(currencyBreakdown).length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">Original:</span>
                    {Object.entries(currencyBreakdown).map(([cur, t], i) => (
                      <span key={cur} className="text-xs text-muted-foreground">
                        {i > 0 && <span className="mx-1 text-border">·</span>}
                        <span className="font-mono font-medium text-foreground">{cur} {t.gross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead className="hidden sm:table-cell">Payment</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">VAT</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((exp) => {
                      const Icon = METHOD_ICONS[exp.payment_method] ?? null;
                      return (
                        <TableRow key={exp.id}>
                          <TableCell className="font-medium max-w-[120px] sm:max-w-[140px]">
                            <p className="truncate">{exp.vendor_name || "—"}</p>
                            {exp.document_number && (
                              <p className="text-xs text-muted-foreground truncate">{exp.document_number}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(exp.document_date)}</TableCell>
                          <TableCell className="text-sm hidden sm:table-cell">{exp.document_type}</TableCell>
                          <TableCell className="text-sm max-w-[120px] hidden md:table-cell">
                            <span className="truncate block">{exp.category || "—"}</span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-1 text-sm">
                              {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className="text-xs">{exp.payment_method.replace("_", " ")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {exp.net_amount != null ? formatCurrency(exp.net_amount, exp.currency) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono text-muted-foreground hidden sm:table-cell">
                            {exp.vat_rate != null && exp.vatRate > 0 ? `${exp.vat_rate}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono font-semibold">
                            {exp.gross_amount != null ? formatCurrency(exp.gross_amount, exp.currency) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANTS[exp.status] ?? "outline"} className="text-xs">
                              {exp.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(exp.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
