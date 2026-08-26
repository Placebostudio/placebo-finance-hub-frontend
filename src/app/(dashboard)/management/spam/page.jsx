"use client";
import React, { useEffect, useState } from "react";
import {
  Trash2, RotateCcw, ShieldAlert, Search, FileText, Receipt, CreditCard,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { documentService } from "@/services/document.service";
import { expenseService } from "@/services/expense.service";
import { statementService } from "@/services/statement.service";
import { transactionService } from "@/services/transaction.service";
import { auditService } from "@/services/audit.service";
import { useOwnerGuard } from "@/hooks/use-owner-guard";
import { formatDate, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";


import { documentRepository } from "@/services/backend-documents";
import { expenseRepository } from "@/services/backend-expenses";
import { statementRepository } from "@/services/backend-statements";
import { transactionRepository } from "@/services/backend-transactions";
import { auditRepository } from "@/services/backend-audits";
import { vendorRepository } from "@/services/backend-vendors";
import { categoryRepository } from "@/services/backend-categories";

// ── helpers ──────────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS = {
  document: "Document",
  expense: "Expense",
  statement: "Statement",
};

const ENTITY_TYPE_ICONS = {
  document: FileText,
  expense: Receipt,
  statement: CreditCard,
};

const ENTITY_TYPE_VARIANTS = {
  document: "secondary",
  expense: "default",
  statement: "outline",
};

function entityLabel(item) {
  if (item._entityType === "document") return item.fileName ?? item.id;
  if (item._entityType === "expense") return item.vendorName || item.documentNumber || item.id;
  if (item._entityType === "statement") return item.fileName || item.period || item.id;
  return item.id;
}

function entityDetails(item) {
  if (item._entityType === "document") {
    return [
      item.fileType,
      item.status && `Status: ${item.status.replace("_", " ")}`,
    ].filter(Boolean).join(" · ");
  }
  if (item._entityType === "expense") {
    return [
      item.documentDate && `Date: ${formatDate(item.documentDate)}`,
      item.grossAmount != null && `Amount: ${formatCurrency(item.grossAmount, item.currency ?? "ILS")}`,
      item.category,
    ].filter(Boolean).join(" · ");
  }
  if (item._entityType === "statement") {
    return [
      item.period && `Period: ${item.period}`,
      item.transactionCount != null && `${item.transactionCount} transactions`,
      item.fileName,
    ].filter(Boolean).join(" · ");
  }
  return "";
}

// ── gather all soft-deleted entities ─────────────────────────────────────────

async function loadSpamItems() {
  try {
    const [docs, exps, stmts] = await Promise.all([
      documentRepository.getAll({ spam: true }),
      expenseRepository.getAll({ spam: true }),
      statementRepository.getAll({ spam: true }),
    ]);

    const all = [
      ...(docs ?? []).map((d) => ({
        ...d,
        _entityType: "document",
      })),

      ...(exps ?? []).map((e) => ({
        ...e,
        _entityType: "expense",
      })),

      ...(stmts ?? []).map((s) => ({
        ...s,
        _entityType: "statement",
      })),
    ];

    // Most recently deleted first
    all.sort((a, b) => {
      const dateA =
        a.deleted_at ??
        a.deletedAt ??
        a.updated_at ??
        a.updatedAt ??
        0;

      const dateB =
        b.deleted_at ??
        b.deletedAt ??
        b.updated_at ??
        b.updatedAt ??
        0;

      return new Date(dateB) - new Date(dateA);
    });

    return all;

  } catch (err) {
    console.error(
      "Failed to load spam items:",
      err
    );

    throw err;
  }
}

// ── SpamCard ──────────────────────────────────────────────────────────────────

function SpamCard({ item, onRestore, onPermanentDelete }) {
  const Icon = ENTITY_TYPE_ICONS[item._entityType] ?? FileText;
  const label = entityLabel(item);
  const details = entityDetails(item);

  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge
                variant={ENTITY_TYPE_VARIANTS[item._entityType] ?? "outline"}
                className="text-xs"
              >
                {ENTITY_TYPE_LABELS[item._entityType] ?? item._entityType}
              </Badge>
              <p className="text-sm font-medium truncate max-w-xs" title={label}>
                {label}
              </p>
            </div>

            {details && (
              <p className="text-xs text-muted-foreground mb-1">{details}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Deleted by{" "}
              <span className="font-medium text-foreground">
                {item.deletedByName ?? "Unknown"}
              </span>
              {" · "}
              {item.deletedAt
                ? new Date(item.deletedAt).toLocaleString("en-GB", {
                  year: "numeric", month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })
                : "—"}
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRestore(item)}
              className="h-8"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onPermanentDelete(item)}
              className="h-8"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Permanently Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SpamPage() {
  const { isAuthenticated, user: currentUser, isOwner } = useOwnerGuard();

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Confirmation dialog state
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function load() {
    setItems(await loadSpamItems());
  }

  useEffect(() => {
    load();
  }, []);

  if (!isAuthenticated) return null;

  if (!isOwner) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Spam" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <ShieldAlert className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Owner access required</p>
        </div>
      </div>
    );
  }

  // ── filtering ───────────────────────────────────────────────────────────────

  console.log(items)
  const filtered = items.filter((item) => {
    if (typeFilter !== "all" && item.entity_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = entityLabel(item).toLowerCase();
      // const deletedBy = (item.deletedByName ?? "").toLowerCase();
      if (!label.includes(q) && !deletedBy.includes(q)) return false;
    }
    return true;
  });

  // ── restore ─────────────────────────────────────────────────────────────────

  async function confirmRestore() {
    const item = restoreTarget;
    if (!item) return;

    if (item._entityType === "document") {

      await documentRepository.update(item.id, {
        spam: false,
      });

    } else if (item._entityType === "expense") {

      await expenseRepository.update(item.id, {
        spam: false,
      });

    } else if (item._entityType === "statement") {

      await statementRepository.update(item.id, {
        spam: false,
      });

    } else if (item._entityType === "vendor") {

      await vendorRepository.update(item.id, {
        spam: false,
      });

    } else if (item._entityType === "category") {

      await categoryRepository.update(item.id, {
        spam: false,
      });

    } else if (item._entityType === "transaction") {

      await transactionRepository.update(item.id, {
        spam: false,
      });

    }
    // else if (item._entityType === "reconciliation") {

    //   await reconciliationRepository.update(item.id, {
    //     spam: false,
    //   });

    // }

    auditRepository.create({
      actorId: currentUser.id,
      actorName: currentUser.fullName,
      action: "restore",
      entityType: item._entityType,
      entityId: item.id,
      entityName: entityLabel(item),
      before: item,
      after: { ...item, deletedAt: null, deletedBy: null, deletedByName: null },
    });

    toast.success(`${ENTITY_TYPE_LABELS[item._entityType] ?? "Item"} restored`);
    setRestoreTarget(null);
    load();
  }

  // ── permanent delete ─────────────────────────────────────────────────────────

  async function confirmPermanentDelete() {
    const item = deleteTarget;
    if (!item) return;

    try {
      if (item._entityType === "document") {

        await documentRepository.delete(item.id);

      } else if (item._entityType === "expense") {

        await expenseRepository.delete(item.id);

      } else if (item._entityType === "statement") {

        // Delete linked transactions first
        await transactionRepository.deleteByStatement(item.id);

        await statementRepository.delete(item.id);

      } else if (item._entityType === "vendor") {

        await vendorRepository.delete(item.id);

      } else if (item._entityType === "category") {

        await categoryRepository.delete(item.id);

      } else if (item._entityType === "transaction") {

        await transactionRepository.delete(item.id);
      }

      auditRepository.create({
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        action: "permanent_delete",
        entityType: item._entityType,
        entityId: item.id,
        entityName: entityLabel(item),
        before: item,
        after: null,
      });

      toast.success(`${ENTITY_TYPE_LABELS[item._entityType] ?? "Item"} permanently deleted`);
    } catch (err) {
      toast.error("Failed to permanently delete: " + (err?.message ?? "Unknown error"));
    }

    setDeleteTarget(null);
    load();
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Spam"
        description="Items waiting for deletion approval"
      />

      <div className="flex-1 p-6 space-y-4 overflow-auto">

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or deleted by…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="statement">Statement</SelectItem>
            </SelectContent>
          </Select>

          {(search || typeFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Summary counts */}
        {items.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{items.length} total</span>
            {items.filter((i) => i._entityType === "document").length > 0 && (
              <>
                <span className="text-border">·</span>
                <span>
                  {items.filter((i) => i._entityType === "document").length} document{items.filter((i) => i._entityType === "document").length !== 1 ? "s" : ""}
                </span>
              </>
            )}
            {items.filter((i) => i._entityType === "expense").length > 0 && (
              <>
                <span className="text-border">·</span>
                <span>
                  {items.filter((i) => i._entityType === "expense").length} expense{items.filter((i) => i._entityType === "expense").length !== 1 ? "s" : ""}
                </span>
              </>
            )}
            {items.filter((i) => i._entityType === "statement").length > 0 && (
              <>
                <span className="text-border">·</span>
                <span>
                  {items.filter((i) => i._entityType === "statement").length} statement{items.filter((i) => i._entityType === "statement").length !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        )}

        {/* Item list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Trash2 className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm font-medium">
              {search || typeFilter !== "all"
                ? "No items match your filters"
                : "No items are waiting for deletion approval"}
            </p>
            {!search && typeFilter === "all" && (
              <p className="text-xs mt-1">
                When users delete documents, expenses, or statements, they appear here for your review.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <SpamCard
                key={`${item._entityType}-${item.id}`}
                item={item}
                onRestore={setRestoreTarget}
                onPermanentDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Restore confirmation dialog ── */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this item?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{restoreTarget ? entityLabel(restoreTarget) : ""}</strong> will be restored
              and become visible again in its original area.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Permanent delete confirmation dialog ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Permanently delete this item?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget ? entityLabel(deleteTarget) : ""}</strong> will be permanently
              removed from the database
              {deleteTarget?._entityType === "document" && " and its file will be deleted from storage"}.
              {deleteTarget?._entityType === "statement" && " All linked transactions will also be permanently deleted."}{" "}
              <span className="font-semibold text-foreground">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
