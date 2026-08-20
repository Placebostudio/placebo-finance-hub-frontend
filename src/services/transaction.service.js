/**
 * Transaction service — manages individual credit-card transactions.
 *
 * Transaction statuses: unmatched | suggested | matched | ignored
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { generateId } from "@/lib/utils";
import { normalizeVendorName } from "@/lib/utils";

const STORE = "transactions";

export const transactionService = {
  getAll() {
    return lsGetArray(STORE);
  },

  getById(id) {
    return this.getAll().find((t) => t.id === id) ?? null;
  },

  getByStatement(statementId) {
    return this.getAll().filter((t) => t.statementId === statementId);
  },

  getUnmatched() {
    return this.getAll().filter((t) => t.status === "unmatched");
  },

  create(data) {
    const now = new Date().toISOString();
    const txn = {
      id: generateId(),
      statementId: data.statementId ?? null,
      statementPeriod: data.statementPeriod ?? null,
      transactionDate: data.transactionDate ?? "",
      postingDate: data.postingDate ?? "",
      description: data.description ?? "",
      normalizedDescription: normalizeVendorName(data.description ?? ""),
      originalAmount: data.originalAmount ?? 0,
      originalCurrency: data.originalCurrency ?? "ILS",
      billedAmount: data.billedAmount ?? data.originalAmount ?? 0,
      billedCurrency: data.billedCurrency ?? data.originalCurrency ?? "ILS",
      cardLastFour: data.cardLastFour ?? "",
      status: "unmatched",
      createdAt: now,
    };
    const all = this.getAll();
    all.push(txn);
    lsSetArray(STORE, all);
    return txn;
  },

  /** Bulk import transactions from a parsed CSV array */
  bulkCreate(rows, statementId, statementPeriod = null) {
    const all = this.getAll();
    const existing = new Set(
      all.map((t) => `${t.transactionDate}|${t.billedAmount}|${t.description}`)
    );
    const created = [];
    for (const row of rows) {
      const key = `${row.transactionDate}|${row.billedAmount ?? row.originalAmount}|${row.description}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const txn = this.createOneInMemory({ ...row, statementId, statementPeriod });
      created.push(txn);
    }
    lsSetArray(STORE, [...all, ...created]);
    return created;
  },

  createOneInMemory(data) {
    const now = new Date().toISOString();
    return {
      id: generateId(),
      statementId: data.statementId ?? null,
      statementPeriod: data.statementPeriod ?? null,
      transactionDate: data.transactionDate ?? "",
      postingDate: data.postingDate ?? "",
      description: data.description ?? "",
      normalizedDescription: normalizeVendorName(data.description ?? ""),
      originalAmount: data.originalAmount ?? 0,
      originalCurrency: data.originalCurrency ?? "ILS",
      billedAmount: data.billedAmount ?? data.originalAmount ?? 0,
      billedCurrency: data.billedCurrency ?? data.originalCurrency ?? "ILS",
      cardLastFour: data.cardLastFour ?? "",
      status: "unmatched",
      createdAt: now,
    };
  },

  update(id, changes) {
    const all = this.getAll().map((t) => (t.id === id ? { ...t, ...changes } : t));
    lsSetArray(STORE, all);
    return all.find((t) => t.id === id) ?? null;
  },

  updateStatus(id, status) {
    return this.update(id, { status });
  },

  delete(id) {
    const all = this.getAll().filter((t) => t.id !== id);
    lsSetArray(STORE, all);
  },

  deleteByStatement(statementId) {
    const all = this.getAll().filter((t) => t.statementId !== statementId);
    lsSetArray(STORE, all);
  },

  /** Return transactions whose statementId is in the given set. */
  getByStatementIds(statementIds) {
    const ids = new Set(statementIds);
    return this.getAll().filter((t) => ids.has(t.statementId));
  },
};
