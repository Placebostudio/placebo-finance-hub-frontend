/**
 * Statement service — manages credit-card statement metadata.
 * Binary PDF (if uploaded) is stored in IndexedDB.
 *
 * Soft-delete fields:
 *   deletedAt:     ISO timestamp of soft deletion, or null
 *   deletedBy:     userId who requested deletion, or null
 *   deletedByName: display name of who requested deletion, or null
 *
 * When a statement is soft-deleted its transactions are automatically hidden
 * from normal views because the transactions page filters by active statement IDs.
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { fileDB } from "@/storage/db";
import { generateId } from "@/lib/utils";

const STORE = "statements";

export const statementService = {
  /** Internal — all records including soft-deleted. */
  _getAllRaw() {
    return lsGetArray(STORE);
  },

  /** Public — active (non-deleted) statements only. */
  getAll() {
    return this._getAllRaw().filter((s) => !s.deletedAt);
  },

  /** Returns only soft-deleted statements (for Spam page). */
  getAllDeleted() {
    return this._getAllRaw().filter((s) => !!s.deletedAt);
  },

  /** Finds a statement by id regardless of deletion state. */
  getById(id) {
    return this._getAllRaw().find((s) => s.id === id) ?? null;
  },

  /** Create a statement from a PDF upload */
  async createFromFile(file, period) {
    const id = generateId();
    const statement = {
      id,
      fileName: file.name,
      fileSize: file.size,
      period: period ?? "",
      uploadedAt: new Date().toISOString(),
      transactionCount: 0,
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
    };

    if (file.type === "application/pdf") {
      await fileDB.saveStatementFile(id, file);
    }

    const all = this._getAllRaw();
    all.push(statement);
    lsSetArray(STORE, all);
    return statement;
  },

  /** Create a statement record manually (no file) */
  createManual(data) {
    const statement = {
      id: generateId(),
      fileName: null,
      fileSize: 0,
      period: data.period ?? "",
      uploadedAt: new Date().toISOString(),
      transactionCount: 0,
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
      ...data,
    };
    const all = this._getAllRaw();
    all.push(statement);
    lsSetArray(STORE, all);
    return statement;
  },

  update(id, changes) {
    const all = this._getAllRaw().map((s) => (s.id === id ? { ...s, ...changes } : s));
    lsSetArray(STORE, all);
    return all.find((s) => s.id === id) ?? null;
  },

  /**
   * Soft delete — marks the statement as deleted without removing data or files.
   * Transactions linked to this statement will be hidden from normal views.
   * Used when a non-owner clicks Delete; the statement enters the Spam queue.
   */
  softDelete(id, deletedBy, deletedByName) {
    return this.update(id, {
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy ?? null,
      deletedByName: deletedByName ?? null,
    });
  },

  /**
   * Restore — undo a soft delete. Statement and its transactions return to normal views.
   */
  restore(id) {
    return this.update(id, {
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
    });
  },

  /**
   * Hard delete — permanently removes the record and associated file.
   * NOTE: Caller is responsible for deleting linked transactions first.
   */
  async hardDelete(id) {
    const all = this._getAllRaw().filter((s) => s.id !== id);
    lsSetArray(STORE, all);
    await fileDB.deleteStatementFile(id).catch(() => {});
  },

  /** Alias kept for internal callers. */
  async delete(id) {
    return this.hardDelete(id);
  },

  async getFile(id) {
    return fileDB.getStatementFile(id);
  },

  /** Return all active statements whose period matches the given YYYY-MM string. */
  getByPeriod(period) {
    return this.getAll().filter((s) => s.period === period);
  },

  /** True if at least one active statement already covers this accounting period. */
  hasPeriod(period) {
    return this.getAll().some((s) => s.period === period);
  },
};
