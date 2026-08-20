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
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { fileDB } from "@/storage/db";
import { generateId } from "@/lib/utils";

const STORE = "documents";

export const documentService = {
  getAll() {
    return lsGetArray(STORE);
  },

  getById(id) {
    return this.getAll().find((d) => d.id === id) ?? null;
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
    };

    await fileDB.saveDocumentFile(id, file);

    const all = this.getAll();
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
    const all = this.getAll().map((d) =>
      d.id === id ? { ...d, ...changes, updatedAt: new Date().toISOString() } : d
    );
    lsSetArray(STORE, all);
    return all.find((d) => d.id === id) ?? null;
  },

  async delete(id) {
    const all = this.getAll().filter((d) => d.id !== id);
    lsSetArray(STORE, all);
    await fileDB.deleteDocumentFile(id);
  },
};
