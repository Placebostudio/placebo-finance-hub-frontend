"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Upload, Eye, Trash2, Search, FileText, Image, Pencil, Clock, CreditCard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodSelector } from "@/components/layout/period-selector";
import { documentService } from "@/services/document.service";
import { expenseService } from "@/services/expense.service";
import { reconciliationService } from "@/services/reconciliation.service";
import { auditService } from "@/services/audit.service";

import { documentRepository } from "@/services/backend-documents";
import { auditRepository } from "@/services/backend-audits";
import { expenseRepository } from "@/services/backend-expenses";



import { usePeriodStore } from "@/store/period";
import { useAuthStore } from "@/store/auth";
import { formatDate, formatFileSize, buildPeriod, periodLabel, dateToPeriod } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_LABELS = {
  pending_review: { label: "Pending Review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export default function DocumentsPage() {
  const { month, year, setPeriod } = usePeriodStore();
  const period = buildPeriod(year, month);
  const { user: currentUser } = useAuthStore();

  const [documents, setDocuments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [confirmedMatches, setConfirmedMatches] = useState([]);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");

  async function load() {
    try {
      const [docs, exps, matches] = await Promise.all([
        documentRepository.getAll(),
        expenseRepository.getAll(),
        reconciliationService.getConfirmed(),
      ]);

      setDocuments(docs ?? []);
      setExpenses(exps ?? []);
      setConfirmedMatches(matches ?? []);
    } catch (err) {
      console.error("Failed to load documents:", err);
      toast.error(err.message || "Failed to load documents");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => { load(); }, []);

  // ── Lookup maps ──────────────────────────────────────────────────────────────
  const expenseByDocId = new Map(expenses.map((e) => [e.documentId, e]));
  const matchedExpenseIds = new Set(confirmedMatches.map((m) => m.expenseId));

  /** Accounting period derived from confirmed document date (via linked expense). */
  function getDocPeriod(doc) {
    const exp = expenseByDocId.get(doc.id);
    return exp?.documentDate ? dateToPeriod(exp.documentDate) : null;
  }

  // ── Split documents ──────────────────────────────────────────────────────────
  // Period docs: any status where a confirmed documentDate exists in the selected period.
  const periodDocs = documents.filter((d) => getDocPeriod(d) === period);

  // Needs-review docs: status is pending_review (no confirmed date yet).
  const needsReviewDocs = documents.filter((d) => d.status === "pending_review");

  // ── Apply filters to period docs ─────────────────────────────────────────────
  const filtered = periodDocs.filter((doc) => {
    const exp = expenseByDocId.get(doc.id);

    // Search: filename or vendor name
    if (search) {
      const q = search.toLowerCase();
      const matchesFile = doc.fileName.toLowerCase().includes(q);
      const matchesVendor = (exp?.vendorName ?? "").toLowerCase().includes(q);
      if (!matchesFile && !matchesVendor) return false;
    }

    // Payment method filter
    if (paymentFilter !== "all") {
      const pm = exp?.paymentMethod ?? "unknown";
      if (paymentFilter === "other") {
        if (pm === "credit_card" || pm === "cash" || pm === "bank_transfer") return false;
      } else if (pm !== paymentFilter) {
        return false;
      }
    }

    // Match status filter (only CC expenses participate in reconciliation)
    if (matchFilter !== "all") {
      const isCc = exp?.paymentMethod === "credit_card";
      if (!isCc) return false; // non-CC docs excluded when a match filter is active
      const isMatched = exp && matchedExpenseIds.has(exp.id);
      if (matchFilter === "matched" && !isMatched) return false;
      if (matchFilter === "unmatched" && isMatched) return false;
    }

    return true;
  });

  // ── Period stats ─────────────────────────────────────────────────────────────
  const ccDocs = periodDocs.filter((d) => expenseByDocId.get(d.id)?.paymentMethod === "credit_card");
  const otherDocs = periodDocs.filter((d) => {
    const pm = expenseByDocId.get(d.id)?.paymentMethod;
    return pm !== "credit_card";
  });
  const matchedCcCount = ccDocs.filter((d) => {
    const exp = expenseByDocId.get(d.id);
    return exp && matchedExpenseIds.has(exp.id);
  }).length;

  async function handleDelete(id) {

    if (!confirm("Delete this document?")) return;

    const doc = documents.find((d) => d.id === id);

    try {

      if (currentUser?.role === "owner") {

        await documentRepository.delete(id);

        await auditRepository.create({
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          action: "delete",
          entityType: "document",
          entityId: id,
          entityName: doc?.file_name ?? doc?.fileName ?? id,
          before: doc,
          after: null,
        });

        toast.success("Document permanently deleted");

      } else {

        await documentRepository.softDelete(id);

        await auditRepository.create({
          actorId: currentUser?.id,
          actorName: currentUser?.fullName,
          action: "soft_delete",
          entityType: "document",
          entityId: id,
          entityName: doc?.file_name ?? doc?.fileName ?? id,
          before: doc,
          after: null,
        });

        toast.success("Document deleted");
      }

      await load();

    } catch (err) {

      console.error("Failed to delete document:", err);

      toast.error(
        err.message || "Failed to delete document"
      );
    }
  }

  function handlePeriodChange(m, y) {
    setPeriod(m, y);
    setSearch("");
    setPaymentFilter("all");
    setMatchFilter("all");
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Documents"
        description={`${periodDocs.length} document${periodDocs.length !== 1 ? "s" : ""} · ${periodLabel(period)}`}
        actions={
          <Button asChild size="sm">
            <Link href="/documents/upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Link>
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-4 overflow-auto">

        {/* ── Period selector bar ── */}
        <div className="flex items-center gap-4 flex-wrap rounded-lg border bg-muted/30 px-4 py-2.5">
          <PeriodSelector
            month={month}
            year={year}
            onChange={handlePeriodChange}
            label="Documents Period"
          />
          <div className="flex items-center gap-3 text-xs text-muted-foreground ml-auto flex-wrap">
            <span>{periodDocs.length} total</span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <CreditCard className="h-3 w-3" /> {ccDocs.length} CC
            </span>
            <span className="text-border">·</span>
            <span>{otherDocs.length} other</span>
            {ccDocs.length > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="text-green-600">{matchedCcCount} matched</span>
              </>
            )}
            {needsReviewDocs.length > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="text-yellow-600">{needsReviewDocs.length} needs review</span>
              </>
            )}
          </div>
        </div>

        {/* ── Filter row ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56"
            />
          </div>

          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="Payment method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="other">Other / Unknown</SelectItem>
            </SelectContent>
          </Select>

          <Select value={matchFilter} onValueChange={setMatchFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="Match status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Period documents grid ── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">
              {search || paymentFilter !== "all" || matchFilter !== "all"
                ? "No documents match your filters"
                : `No documents for ${periodLabel(period)}`}
            </p>
            {!search && paymentFilter === "all" && matchFilter === "all" && (
              <Button asChild variant="outline" className="mt-4">
                <Link href="/documents/upload">Upload a document</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((doc) => {
              const status = STATUS_LABELS[doc.status] ?? { label: doc.status, variant: "outline" };
              const isImage = doc.fileType?.startsWith("image/");
              const exp = expenseByDocId.get(doc.id);
              const isCc = exp?.paymentMethod === "credit_card";
              const isMatched = isCc && exp && matchedExpenseIds.has(exp.id);
              return (
                <Card key={doc.id} className="group hover:border-primary/50 transition-colors">
                  <CardContent className="p-4 space-y-3">
                    <div className="aspect-[4/3] rounded-lg bg-muted flex items-center justify-center">
                      {isImage
                        ? <Image className="h-10 w-10 text-muted-foreground/40" />
                        : <FileText className="h-10 w-10 text-muted-foreground/40" />}
                    </div>

                    <div>
                      <p className="text-sm font-medium truncate" title={doc.fileName}>
                        {doc.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {exp?.vendorName ? `${exp.vendorName} · ` : ""}
                        {exp?.documentDate ? formatDate(exp.documentDate) : formatDate(doc.uploadedAt)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 flex-wrap min-w-0">
                        <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                        {isCc && isMatched && (
                          <Badge variant="success" className="text-xs">Matched</Badge>
                        )}
                        {isCc && !isMatched && doc.status === "approved" && (
                          <Badge variant="warning" className="text-xs">Unmatched</Badge>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {doc.status === "pending_review" && (
                          <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                            <Link href={`/documents/review/${doc.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                        {doc.status === "approved" && (
                          <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                            <Link href={`/documents/${doc.id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(doc.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Needs Review section — docs without a confirmed accounting period ── */}
        {needsReviewDocs.length > 0 && (
          <div className="mt-6 border-t pt-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
              <span className="text-sm font-medium">
                Needs Review ({needsReviewDocs.length})
              </span>
              <span className="text-xs text-muted-foreground">
                — no accounting period assigned until document date is confirmed
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {needsReviewDocs
                .filter((d) => !search || d.fileName.toLowerCase().includes(search.toLowerCase()))
                .map((doc) => {
                  const isImage = doc.fileType?.startsWith("image/");
                  return (
                    <Card
                      key={doc.id}
                      className="group hover:border-yellow-400 border-yellow-200 dark:border-yellow-900 transition-colors"
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="aspect-[4/3] rounded-lg bg-muted flex items-center justify-center">
                          {isImage
                            ? <Image className="h-10 w-10 text-muted-foreground/40" />
                            : <FileText className="h-10 w-10 text-muted-foreground/40" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium truncate" title={doc.fileName}>
                            {doc.fileName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatFileSize(doc.fileSize)} · Uploaded {formatDate(doc.uploadedAt)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge variant="warning" className="text-xs">Pending Review</Badge>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                              <Link href={`/documents/review/${doc.id}`}>
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(doc.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
