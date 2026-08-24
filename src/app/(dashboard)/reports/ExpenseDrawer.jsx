"use client";
import React from "react";
import {
    Download, Receipt, ArrowRight, CreditCard, Landmark, Banknote,
    FileText, Building2, Calendar, Tag, Hash
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency, formatDate } from "@/lib/utils";

const METHOD_ICONS = { credit_card: CreditCard, bank_transfer: Landmark, cash: Banknote };
const METHOD_LABELS = { credit_card: "Credit Card", bank_transfer: "Bank Transfer", cash: "Cash" };

const COVERAGE_VARIANTS = {
    fully_matched: "success",
    partially_matched: "warning",
    unmatched: "outline",
};
const COVERAGE_LABELS = {
    fully_matched: "Fully Matched",
    partially_matched: "Partially Matched",
    unmatched: "Unmatched",
};

const STATUS_VARIANTS = {
    approved: "success",
    draft: "secondary",
    rejected: "destructive",
};

function DetailRow({ icon: Icon, label, value }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium break-words">{value}</p>
            </div>
        </div>
    );
}

function RelationshipFlow({ expense }) {
    const { document, match } = expense;
    const transaction = match?.transaction ?? null;
    const statement = transaction?.statement ?? null;

    if (!document && !transaction) {
        return (
            <div className="text-sm text-muted-foreground text-center border rounded-md py-6">
                No receipt or matching transaction
            </div>
        );
    }

    return (
        <div className="flex items-start gap-2 overflow-x-auto py-2 pb-3">
            {/* Receipt box */}
            <div className="flex-shrink-0 rounded-md border p-3 min-w-[110px]">
                <div className="flex items-center gap-1 mb-1">
                    <Receipt className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <span className="text-xs font-semibold">Receipt</span>
                </div>
                {document ? (
                    <p className="text-xs text-muted-foreground truncate max-w-[100px]">{document.file_name}</p>
                ) : (
                    <p className="text-xs text-muted-foreground italic">Missing</p>
                )}
            </div>

            <ArrowRight className="h-4 w-4 text-muted-foreground mt-4 flex-shrink-0" />

            {/* Expense box (highlighted) */}
            <div className="flex-shrink-0 rounded-md border border-primary/40 bg-primary/5 p-3 min-w-[120px]">
                <div className="flex items-center gap-1 mb-1">
                    <FileText className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <span className="text-xs font-semibold">Expense</span>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-[110px]">
                    {expense.vendor_name || expense.document_number || "—"}
                </p>
                <p className="text-xs font-mono mt-0.5">
                    {formatCurrency(expense.gross_amount, expense.currency)}
                </p>
            </div>

            {transaction && (
                <>
                    <ArrowRight className="h-4 w-4 text-muted-foreground mt-4 flex-shrink-0" />

                    {/* Transaction box */}
                    <div className="flex-shrink-0 rounded-md border p-3 min-w-[130px]">
                        <div className="flex items-center gap-1 mb-1">
                            <CreditCard className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            <span className="text-xs font-semibold">Transaction</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {transaction.description || transaction.counterparty_ref || "—"}
                        </p>
                        <p className="text-xs font-mono mt-0.5">
                            {formatCurrency(Math.abs(transaction.billed_amount ?? 0), transaction.billed_currency)}
                        </p>
                        {transaction.transaction_date && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(transaction.transaction_date)}
                            </p>
                        )}
                    </div>

                    {statement && (
                        <>
                            <ArrowRight className="h-4 w-4 text-muted-foreground mt-4 flex-shrink-0" />

                            {/* Statement box */}
                            <div className="flex-shrink-0 rounded-md border p-3 min-w-[110px]">
                                <div className="flex items-center gap-1 mb-1">
                                    <Building2 className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                                    <span className="text-xs font-semibold">Statement</span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate max-w-[100px]">
                                    {statement.account_label || statement.statement_type || "—"}
                                </p>
                                {statement.period && (
                                    <p className="text-xs text-muted-foreground">{statement.period}</p>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

function DocumentPreview({ document }) {
    if (!document?.url) return null;

    const isPDF =
        document.file_type === "application/pdf" ||
        /\.pdf$/i.test(document.file_name ?? "");

    const isImage =
        (document.file_type ?? "").startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(document.file_name ?? "");

    if (isPDF) {
        return (
            <div className="rounded-md border overflow-hidden">
                <iframe
                    src={document.url}
                    title="Receipt preview"
                    className="w-full h-80"
                />
            </div>
        );
    }

    if (isImage) {
        return (
            <div className="rounded-md border overflow-hidden bg-muted/30">
                <img
                    src={document.url}
                    alt="Receipt"
                    className="w-full max-h-80 object-contain"
                />
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground border rounded-md">
            <FileText className="h-5 w-5 flex-shrink-0" />
            {document.file_name}
        </div>
    );
}

export default function ExpenseDrawer({ expense, open, onClose }) {
    if (!expense) return null;

    const MethodIcon = METHOD_ICONS[expense.payment_method];

    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <SheetContent className="flex flex-col p-0 sm:max-w-2xl">

                {/* Fixed header */}
                <div className="px-6 pt-10 pb-4 border-b flex-shrink-0">
                    <SheetTitle className="text-base leading-snug">
                        {expense.vendor_name || expense.document_number || "Expense"}
                    </SheetTitle>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                        {expense.document_date && (
                            <span>{formatDate(expense.document_date)}</span>
                        )}
                        {expense.document_number && (
                            <span className="font-mono">· {expense.document_number}</span>
                        )}
                        <Badge
                            variant={STATUS_VARIANTS[expense.status] ?? "secondary"}
                            className="ml-auto"
                        >
                            {expense.status}
                        </Badge>
                    </div>
                </div>

                {/* Scrollable body */}
                <ScrollArea className="flex-1">
                    <div className="px-6 py-5 space-y-6">

                        {/* Amount summary */}
                        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                            <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Gross</p>
                                <p className="text-base font-semibold font-mono">
                                    {formatCurrency(expense.gross_amount, expense.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Net</p>
                                <p className="text-base font-semibold font-mono">
                                    {formatCurrency(expense.net_amount, expense.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground mb-0.5">
                                    VAT{expense.vat_rate != null ? ` (${expense.vat_rate}%)` : ""}
                                </p>
                                <p className="text-base font-semibold font-mono">
                                    {formatCurrency(expense.vat_amount, expense.currency)}
                                </p>
                            </div>
                        </div>

                        {/* Expense details */}
                        <div className="space-y-3">
                            {expense.category && (
                                <DetailRow icon={Tag} label="Category" value={expense.category.name} />
                            )}
                            {expense.payment_method && (
                                <div className="flex items-start gap-3">
                                    {MethodIcon && (
                                        <MethodIcon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    )}
                                    <div>
                                        <p className="text-xs text-muted-foreground">Payment Method</p>
                                        <p className="text-sm font-medium">
                                            {METHOD_LABELS[expense.payment_method] ?? expense.payment_method}
                                        </p>
                                    </div>
                                </div>
                            )}
                            <DetailRow icon={Hash} label="Document Number" value={expense.document_number} />
                            <DetailRow
                                icon={Calendar}
                                label="Document Date"
                                value={expense.document_date ? formatDate(expense.document_date) : null}
                            />
                            {expense.notes && (
                                <DetailRow icon={FileText} label="Notes" value={expense.notes} />
                            )}
                        </div>

                        <Separator />

                        {/* Transaction relationship */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold">Transaction Relationship</h3>
                                <Badge variant={COVERAGE_VARIANTS[expense.coverage_state] ?? "outline"}>
                                    {COVERAGE_LABELS[expense.coverage_state] ?? "Unmatched"}
                                </Badge>
                            </div>
                            <RelationshipFlow expense={expense} />
                        </div>

                        {expense.document && (
                            <>
                                <Separator />

                                {/* Document preview */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold">Receipt / Invoice</h3>
                                        {expense.document.url && (
                                            <Button variant="outline" size="sm" asChild>
                                                <a
                                                    href={expense.document.url}
                                                    download={expense.document.file_name}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    <Download className="h-3.5 w-3.5 mr-1.5" />
                                                    Download
                                                </a>
                                            </Button>
                                        )}
                                    </div>
                                    <DocumentPreview document={expense.document} />
                                </div>
                            </>
                        )}

                        {/* Bottom padding */}
                        <div className="h-4" />
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
