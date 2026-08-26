"use client";
import React, { useEffect, useState } from "react";
import {
    Search, CreditCard, Landmark, Banknote, Loader2,
    Receipt, AlertCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/layout/period-selector";
import { expenseLedgerRepository } from "@/services/backend-expense-ledger";
import { usePeriodStore } from "@/store/period";
import { formatCurrency, formatDate, buildPeriod } from "@/lib/utils";
import ExpenseDrawer from "./ExpenseDrawer";

const METHOD_ICONS = { credit_card: CreditCard, bank_transfer: Landmark, cash: Banknote };
const METHOD_LABELS = { credit_card: "Credit Card", bank_transfer: "Bank Transfer", cash: "Cash" };

const COVERAGE_VARIANTS = {
    fully_matched: "success",
    partially_matched: "warning",
    unmatched: "outline",
};
const COVERAGE_LABELS = {
    fully_matched: "Matched",
    partially_matched: "Partial",
    unmatched: "Unmatched",
};

export default function ExpenseLedger() {
    const { month: globalMonth, year: globalYear } = usePeriodStore();
    const [month, setMonth] = useState(globalMonth);
    const [year, setYear] = useState(globalYear);
    const [paymentMethod, setPaymentMethod] = useState("");
    const [receiptStatus, setReceiptStatus] = useState("");
    const [coverageState, setCoverageState] = useState("");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedExpense, setSelectedExpense] = useState(null);

    // Debounce search to avoid firing on every keystroke
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

    const period = buildPeriod(year, month);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const data = await expenseLedgerRepository.getAll({
                    period,
                    payment_method: paymentMethod || undefined,
                    receipt_status: receiptStatus || undefined,
                    coverage_state: coverageState || undefined,
                    search: debouncedSearch || undefined,
                });
                if (!cancelled) setExpenses(data);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [period, paymentMethod, receiptStatus, coverageState, debouncedSearch]);

    console.log(expenses)

    function handlePeriodChange(m, y) {
        setMonth(m);
        setYear(y);
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center rounded-lg border bg-muted/30 px-4 py-2.5">
                <PeriodSelector
                    month={month}
                    year={year}
                    onChange={handlePeriodChange}
                    label="Period"
                />

                <Select
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                >
                    <SelectTrigger className="w-[160px] h-9 text-sm">
                        <SelectValue placeholder="Payment Method" />
                    </SelectTrigger>

                    <SelectContent>
                        <SelectItem value="">All Methods</SelectItem>
                        <SelectItem value="credit_card">
                            Credit Card
                        </SelectItem>
                        <SelectItem value="bank_transfer">
                            Bank Transfer
                        </SelectItem>
                        <SelectItem value="cash">
                            Cash
                        </SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={receiptStatus}
                    onValueChange={setReceiptStatus}
                >
                    <SelectTrigger className="w-[140px] h-9 text-sm">
                        <SelectValue placeholder="Receipt" />
                    </SelectTrigger>

                    <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        <SelectItem value="attached">
                            Attached
                        </SelectItem>
                        <SelectItem value="missing">
                            Missing
                        </SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={coverageState}
                    onValueChange={setCoverageState}
                >
                    <SelectTrigger className="w-[155px] h-9 text-sm">
                        <SelectValue placeholder="Reconciliation" />
                    </SelectTrigger>

                    <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        <SelectItem value="fully_matched">
                            Matched
                        </SelectItem>
                        <SelectItem value="partially_matched">
                            Partial
                        </SelectItem>
                        <SelectItem value="unmatched">
                            Unmatched
                        </SelectItem>
                    </SelectContent>
                </Select>

                <div className="relative ml-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />

                    <Input
                        placeholder="Search vendor, doc #, description…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 h-9 w-64 text-sm"
                    />
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Payment</TableHead>
                            <TableHead className="text-right">
                                Amount
                            </TableHead>
                            <TableHead>Receipt</TableHead>
                            <TableHead>Reconciliation</TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="text-center py-12"
                                >
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : expenses.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="text-center py-12 text-muted-foreground text-sm"
                                >
                                    No expenses found for this period.
                                </TableCell>
                            </TableRow>
                        ) : (
                            expenses.map((expense) => {
                                const MethodIcon =
                                    METHOD_ICONS[expense.payment_method];

                                return (
                                    <TableRow
                                        key={expense.expense_id}
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() =>
                                            setSelectedExpense(expense)
                                        }
                                    >
                                        {/* Date */}
                                        <TableCell className="text-sm text-nowrap">
                                            {expense.document_date
                                                ? formatDate(
                                                    expense.document_date
                                                )
                                                : "—"}
                                        </TableCell>

                                        {/* Vendor */}
                                        <TableCell>
                                            <p className="text-sm font-medium">
                                                {expense.vendor_name || "—"}
                                            </p>

                                            {expense.document_number && (
                                                <p className="text-xs text-muted-foreground font-mono">
                                                    {expense.document_number}
                                                </p>
                                            )}
                                        </TableCell>

                                        {/* Category */}
                                        <TableCell>
                                            {expense.category_name ? (
                                                <Badge variant="secondary">
                                                    {expense.category_name}
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    —
                                                </span>
                                            )}
                                        </TableCell>

                                        {/* Payment */}
                                        <TableCell>
                                            {MethodIcon ? (
                                                <div className="flex items-center gap-1.5 text-sm text-nowrap">
                                                    <MethodIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

                                                    {METHOD_LABELS[
                                                        expense.payment_method
                                                    ]}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    —
                                                </span>
                                            )}
                                        </TableCell>

                                        {/* Amount */}
                                        <TableCell className="text-right text-sm font-mono text-nowrap">
                                            {formatCurrency(
                                                expense.gross_amount,
                                                expense.currency
                                            )}
                                        </TableCell>

                                        {/* Receipt */}
                                        <TableCell>
                                            {expense.linked_document_id ? (
                                                <Badge variant="success">
                                                    <Receipt className="h-3 w-3 mr-1" />
                                                    Attached
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="text-muted-foreground"
                                                >
                                                    Missing
                                                </Badge>
                                            )}
                                        </TableCell>

                                        {/* Reconciliation */}
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    COVERAGE_VARIANTS[
                                                    expense.coverage_state
                                                    ] ?? "outline"
                                                }
                                            >
                                                {COVERAGE_LABELS[
                                                    expense.coverage_state
                                                ] ?? "—"}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Record count */}
            {expenses.length > 0 && !loading && (
                <p className="text-xs text-muted-foreground text-right">
                    {expenses.length} record
                    {expenses.length !== 1 ? "s" : ""}
                </p>
            )}

            {/* Expense drawer */}
            <ExpenseDrawer
                expense={selectedExpense}
                open={!!selectedExpense}
                onClose={() => setSelectedExpense(null)}
            />
        </div>
    );
}
