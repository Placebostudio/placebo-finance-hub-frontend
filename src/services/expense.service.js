/**
 * Expense service — manages expense records.
 *
 * Only expenses with paymentMethod === 'credit_card' participate
 * in credit-card reconciliation.
 *
 * Expense statuses: draft | approved | rejected
 *
 * Soft-delete fields:
 *   deletedAt:     ISO timestamp of soft deletion, or null
 *   deletedBy:     userId who requested deletion, or null
 *   deletedByName: display name of who requested deletion, or null
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { generateId } from "@/lib/utils";

const STORE = "expenses";

export const expenseService = {
  /** Internal — all records including soft-deleted. */
  _getAllRaw() {
    return lsGetArray(STORE);
  },

  /** Public — active (non-deleted) expenses only. */
  getAll() {
    return this._getAllRaw().filter((e) => !e.deletedAt);
  },

  /** Returns only soft-deleted expenses (for Spam page). */
  getAllDeleted() {
    return this._getAllRaw().filter((e) => !!e.deletedAt);
  },

  /** Finds an expense by id regardless of deletion state. */
  getById(id) {
    return this._getAllRaw().find((e) => e.id === id) ?? null;
  },

  getApproved() {
    return this.getAll().filter((e) => e.status === "approved");
  },

  /** Approved CC expenses eligible for reconciliation */
  getApprovedCreditCard() {
    return this.getAll().filter(
      (e) => e.status === "approved" && e.paymentMethod === "credit_card"
    );
  },

  getByDocumentId(documentId) {
    return this.getAll().find((e) => e.documentId === documentId) ?? null;
  },

  create(data) {
    const now = new Date().toISOString();
    const expense = {
      id: generateId(),
      documentId: data.documentId ?? null,
      vendorName: data.vendorName ?? "",
      documentType: data.documentType ?? "receipt",
      documentNumber: data.documentNumber ?? "",
      documentDate: data.documentDate ?? "",
      dueDate: data.dueDate ?? "",
      currency: data.currency ?? "ILS",
      country: data.country ?? "",
      netAmount: data.netAmount ?? null,
      vatAmount: data.vatAmount ?? null,
      vatRate: data.vatRate ?? null,
      grossAmount: data.grossAmount ?? null,
      category: data.category ?? "",
      paymentMethod: data.paymentMethod ?? "unknown",
      cardLastFour: data.cardLastFour ?? "",
      notes: data.notes ?? "",
      status: data.status ?? "draft",
      createdAt: now,
      updatedAt: now,
      approvedAt: data.status === "approved" ? now : null,
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
    };

    const all = this._getAllRaw();
    all.push(expense);
    lsSetArray(STORE, all);
    return expense;
  },

  update(id, changes) {
    const now = new Date().toISOString();
    const extra = {};
    if (changes.status === "approved") extra.approvedAt = now;
    const all = this._getAllRaw().map((e) =>
      e.id === id ? { ...e, ...changes, ...extra, updatedAt: now } : e
    );
    lsSetArray(STORE, all);
    return all.find((e) => e.id === id) ?? null;
  },

  /**
   * Soft delete — marks the expense as deleted without removing it.
   * Used when a non-owner clicks Delete; the expense enters the Spam queue.
   */
  softDelete(id, deletedBy, deletedByName) {
    return this.update(id, {
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy ?? null,
      deletedByName: deletedByName ?? null,
    });
  },

  /**
   * Restore — undo a soft delete. Expense returns to normal views.
   */
  restore(id) {
    return this.update(id, {
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
    });
  },

  /**
   * Hard delete — permanently removes the record.
   */
  hardDelete(id) {
    const all = this._getAllRaw().filter((e) => e.id !== id);
    lsSetArray(STORE, all);
  },

  /** Alias kept for internal callers. */
  delete(id) {
    return this.hardDelete(id);
  },

  /** Return all expenses whose documentDate falls within the given YYYY-MM period. */
  getByPeriod(period) {
    return this.getAll().filter(
      (e) => e.documentDate && e.documentDate.startsWith(period)
    );
  },

  /** Approved CC expenses for a specific accounting period. Used by reconciliation. */
  getApprovedCreditCardByPeriod(period) {
    return this.getAll().filter(
      (e) =>
        e.status === "approved" &&
        e.paymentMethod === "credit_card" &&
        e.documentDate &&
        e.documentDate.startsWith(period)
    );
  },

  /** Get stats for a given YYYY-MM period string */
  getMonthStats(period) {
    const all = this.getAll().filter(
      (e) => e.documentDate && e.documentDate.startsWith(period)
    );
    return {
      total: all.length,
      approved: all.filter((e) => e.status === "approved").length,
      draft: all.filter((e) => e.status === "draft").length,
      rejected: all.filter((e) => e.status === "rejected").length,
      creditCard: all.filter((e) => e.paymentMethod === "credit_card" && e.status === "approved").length,
    };
  },
};
