/**
 * Document service — manages uploaded file metadata.
 * Binary data is stored separately in IndexedDB via fileDB.
 *
 * Document lifecycle:
 *   uploaded → extracting → ready_for_review → approved | rejected
 *   uploaded → extracting → failed            (user fills form manually)
 *
 * extractionStatus: 'uploaded' | 'extracting' | 'ready_for_review' | 'failed'
 * status:           'pending_review' | 'approved' | 'rejected'
 *
 * Soft-delete fields (added when a non-owner deletes):
 *   deletedAt:     ISO timestamp of soft deletion, or null
 *   deletedBy:     userId who requested deletion, or null
 *   deletedByName: display name of who requested deletion, or null
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { fileDB } from "@/storage/db";
import { generateId } from "@/lib/utils";

const STORE = "documents";

export const documentService = {
  /** Internal — all records including soft-deleted. */
  _getAllRaw() {
    return lsGetArray(STORE);
  },

  /** Public — active (non-deleted) documents only. */
  getAll() {
    return this._getAllRaw().filter((d) => !d.deletedAt);
  },

  /** Returns only soft-deleted documents (for Spam page). */
  getAllDeleted() {
    return this._getAllRaw().filter((d) => !!d.deletedAt);
  },

  /** Finds a document by id regardless of deletion state. */
  getById(id) {
    return this._getAllRaw().find((d) => d.id === id) ?? null;
  },

  getPendingReview() {
    return this.getAll().filter((d) => d.status === "pending_review");
  },

  /** Upload a File object — stores metadata in localStorage, binary in IndexedDB */
  async upload(file, uploadedBy = "user") {
    const id = generateId();
    const doc = {
      id,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      status: "pending_review",
      extractionStatus: "uploaded",
      extractionResult: null,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
      notes: "",
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
    };

    await fileDB.saveDocumentFile(id, file);

    const all = this._getAllRaw();
    all.push(doc);
    lsSetArray(STORE, all);

    return doc;
  },

  /** Retrieve the binary blob for preview */
  async getFile(id) {
    return fileDB.getDocumentFile(id);
  },

  /** Update extraction status (and optionally the result). */
  updateExtraction(id, extractionStatus, extractionResult = undefined) {
    const changes = { extractionStatus };
    if (extractionResult !== undefined) changes.extractionResult = extractionResult;
    return this.update(id, changes);
  },

  /** Mark document status */
  updateStatus(id, status) {
    return this.update(id, { status });
  },

  update(id, changes) {
    const all = this._getAllRaw().map((d) =>
      d.id === id ? { ...d, ...changes, updatedAt: new Date().toISOString() } : d
    );
    lsSetArray(STORE, all);
    return all.find((d) => d.id === id) ?? null;
  },

  /**
   * Soft delete — marks the document as deleted without removing data or files.
   * Used when a non-owner clicks Delete; the document enters the Spam queue.
   */
  softDelete(id, deletedBy, deletedByName) {
    return this.update(id, {
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy ?? null,
      deletedByName: deletedByName ?? null,
    });
  },

  /**
   * Restore — undo a soft delete. Document returns to normal views.
   */
  restore(id) {
    return this.update(id, {
      deletedAt: null,
      deletedBy: null,
      deletedByName: null,
    });
  },

  /**
   * Hard delete — permanently removes the record and the associated file.
   * Used by the owner either directly or from the Spam page.
   */
  async hardDelete(id) {
    const all = this._getAllRaw().filter((d) => d.id !== id);
    lsSetArray(STORE, all);
    await fileDB.deleteDocumentFile(id).catch(() => {});
  },

  /** Alias kept for internal callers that still use .delete() */
  async delete(id) {
    return this.hardDelete(id);
  },
};
