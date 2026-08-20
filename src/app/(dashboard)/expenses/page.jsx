"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Receipt, Search, Trash2, CreditCard, Landmark, Banknote } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodSelector } from "@/components/layout/period-selector";
import { expenseService } from "@/services/expense.service";
import { usePeriodStore } from "@/store/period";
import { formatCurrency, formatDate, buildPeriod, periodLabel } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_VARIANTS = { approved: "success", draft: "secondary", rejected: "destructive" };
const METHOD_ICONS = { credit_card: CreditCard, bank_transfer: Landmark, cash: Banknote };

export default function ExpensesPage() {
  const { month, year, setPeriod } = usePeriodStore();
  const period = buildPeriod(year, month);

  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  function load() { setExpenses(expenseService.getAll()); }
  useEffect(() => { load(); }, []);

  function handlePeriodChange(m, y) {
    setPeriod(m, y);
    setSearch("");
    setStatusFilter("all");
  }

  const periodExpenses = expenses.filter(
    (e) => e.documentDate && e.documentDate.startsWith(period)
  );

  const filtered = periodExpenses.filter((e) => {
    const matchSearch =
      !search ||
      (e.vendorName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.documentNumber ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totals = filtered.reduce((acc, e) => {
    if (e.status === "approved") {
      acc.gross += e.grossAmount ?? 0;
      acc.vat += e.vatAmount ?? 0;
    }
    return acc;
  }, { gross: 0, vat: 0 });

  function handleDelete(id) {
    if (!confirm("Delete this expense?")) return;
    expenseService.delete(id);
    toast.success("Expense deleted");
    load();
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

      <div className="flex-1 p-6 space-y-4 overflow-auto">

        {/* Period selector bar */}
        <div className="flex items-center gap-4 flex-wrap rounded-lg border bg-muted/30 px-4 py-2.5">
          <PeriodSelector month={month} year={year} onChange={handlePeriodChange} label="Expenses Period" />
        </div>

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-xs">
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
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Receipt className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">{search || statusFilter !== "all" ? "No expenses match your filter" : `No expenses for ${periodLabel(period)}`}</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            {totals.gross > 0 && (
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground">Approved total:</span>
                <span className="font-semibold">{formatCurrency(totals.gross, "ILS")}</span>
                <span className="text-muted-foreground">incl. VAT {formatCurrency(totals.vat, "ILS")}</span>
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((exp) => {
                      const Icon = METHOD_ICONS[exp.paymentMethod] ?? null;
                      return (
                        <TableRow key={exp.id}>
                          <TableCell className="font-medium max-w-[140px]">
                            <p className="truncate">{exp.vendorName || "—"}</p>
                            {exp.documentNumber && (
                              <p className="text-xs text-muted-foreground truncate">{exp.documentNumber}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(exp.documentDate)}</TableCell>
                          <TableCell className="text-sm">{exp.documentType}</TableCell>
                          <TableCell className="text-sm max-w-[120px]">
                            <span className="truncate block">{exp.category || "—"}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className="text-xs">{exp.paymentMethod.replace("_", " ")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {formatCurrency(exp.netAmount ?? 0, exp.currency)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono text-muted-foreground">
                            {exp.vatRate > 0 ? `${exp.vatRate}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono font-semibold">
                            {formatCurrency(exp.grossAmount ?? 0, exp.currency)}
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
