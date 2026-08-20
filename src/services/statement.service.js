/**
 * Statement service — manages credit-card statement metadata.
 * Binary PDF (if uploaded) is stored in IndexedDB.
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { fileDB } from "@/storage/db";
import { generateId } from "@/lib/utils";

const STORE = "statements";

export const statementService = {
  getAll() {
    return lsGetArray(STORE);
  },

  getById(id) {
    return this.getAll().find((s) => s.id === id) ?? null;
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
    };

    if (file.type === "application/pdf") {
      await fileDB.saveStatementFile(id, file);
    }

    const all = this.getAll();
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
      ...data,
    };
    const all = this.getAll();
    all.push(statement);
    lsSetArray(STORE, all);
    return statement;
  },

  update(id, changes) {
    const all = this.getAll().map((s) => (s.id === id ? { ...s, ...changes } : s));
    lsSetArray(STORE, all);
    return all.find((s) => s.id === id) ?? null;
  },

  async delete(id) {
    const all = this.getAll().filter((s) => s.id !== id);
    lsSetArray(STORE, all);
    await fileDB.deleteStatementFile(id).catch(() => {});
  },

  async getFile(id) {
    return fileDB.getStatementFile(id);
  },

  /** Return all statements whose period matches the given YYYY-MM string. */
  getByPeriod(period) {
    return this.getAll().filter((s) => s.period === period);
  },

  /** True if at least one statement already covers this accounting period. */
  hasPeriod(period) {
    return this.getAll().some((s) => s.period === period);
  },
};
