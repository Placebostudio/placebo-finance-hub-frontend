/**
 * Audit log service — records all significant actions in localStorage.
 * Each entry captures who did what, to which entity, and when.
 *
 * Action naming convention:
 *   create               – entity was created
 *   update               – entity was updated
 *   soft_delete_requested – non-owner deleted entity (enters Spam)
 *   delete               – owner hard-deleted entity directly
 *   restore              – owner restored entity from Spam
 *   permanent_delete     – owner permanently hard-deleted entity from Spam
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { generateId } from "@/lib/utils";

const STORE = "audit_log";

export const auditService = {
  /** Return all audit entries, newest first. */
  getAll(filters = {}) {
    let entries = lsGetArray(STORE);

    if (filters.action) {
      entries = entries.filter((e) => e.action === filters.action);
    }
    if (filters.entityType) {
      entries = entries.filter((e) => e.entityType === filters.entityType);
    }
    if (filters.actorId) {
      entries = entries.filter((e) => e.actorId === filters.actorId);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      entries = entries.filter(
        (e) =>
          (e.actorName ?? "").toLowerCase().includes(q) ||
          (e.entityName ?? "").toLowerCase().includes(q) ||
          (e.entityType ?? "").toLowerCase().includes(q) ||
          (e.action ?? "").toLowerCase().includes(q)
      );
    }

    return entries;
  },

  getById(id) {
    return lsGetArray(STORE).find((e) => e.id === id) ?? null;
  },

  /**
   * Record an audit event.
   *
   * @param {object} params
   * @param {string}  params.actorId      - ID of the user performing the action
   * @param {string}  params.actorName    - Display name of the actor
   * @param {string}  params.action       - Action type (see naming convention above)
   * @param {string}  params.entityType   - 'document' | 'expense' | 'statement' | 'user'
   * @param {string}  params.entityId     - Primary key of the affected entity
   * @param {string}  params.entityName   - Human-readable entity identifier for display
   * @param {object}  [params.before]     - State before the action (omit file blobs)
   * @param {object}  [params.after]      - State after the action
   */
  log({ actorId, actorName, action, entityType, entityId, entityName, before = null, after = null }) {
    const safeSnap = (obj) => {
      if (!obj) return null;
      // Strip any large binary-like fields from audit snapshots
      const { extractionResult, ...rest } = obj;
      void extractionResult;
      return rest;
    };

    const entry = {
      id: generateId(),
      actorId: actorId ?? null,
      actorName: actorName ?? "Unknown",
      action,
      entityType,
      entityId,
      entityName: entityName ?? entityId,
      before: safeSnap(before),
      after: safeSnap(after),
      timestamp: new Date().toISOString(),
    };

    const all = lsGetArray(STORE);
    all.unshift(entry); // newest first
    lsSetArray(STORE, all);

    return entry;
  },
};
