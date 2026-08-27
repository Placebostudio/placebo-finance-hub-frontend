/**
 * Reconciliation service — manages matches between expense records and transactions.
 *
 * Match statuses: confirmed | rejected | pending
 * Match types: strong_candidate | possible_candidate | manual
 *
 * The matching algorithm is deterministic and purely rule-based (no AI).
 *
 * Scoring weights (total 100):
 *   Amount   50 pts — primary signal
 *   Date     30 pts — secondary signal
 *   Currency 15 pts — tertiary signal
 *   Vendor    5 pts — supporting hint only (OCR is unreliable for vendor names)
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { generateId, normalizeVendorName } from "@/lib/utils";
import { transactionService } from "./transaction.service";

const STORE = "matches";

// ── Matching algorithm ────────────────────────────────────────────────────────

/**
 * Score an (expense, transaction) pair. Returns { score: 0–100, reasons: string[] }.
 * Pure function — no side effects.
 *
 * Weights:
 *   Amount match   50 pts  (primary signal)
 *   Date proximity 30 pts  (secondary signal)
 *   Currency match 15 pts  (tertiary signal)
 *   Vendor match    5 pts  (supporting hint only)
 */
export function scoreMatch(expense, transaction) {
  let score = 0;
  const reasons = [];

  // ── Amount (50 pts) ──────────────────────────────────────────────────────
  const expenseAmt = Math.abs(expense.grossAmount ?? 0);
  const txnAmt = Math.abs(transaction.billedAmount ?? transaction.originalAmount ?? 0);
  if (expenseAmt > 0 && txnAmt > 0) {
    const diff = Math.abs(expenseAmt - txnAmt);
    const pct = diff / expenseAmt;
    if (pct < 0.005) {
      score += 50;
      reasons.push("Exact amount match");
    } else if (pct < 0.02) {
      score += 38;
      reasons.push("Near-exact amount");
    } else if (pct < 0.05) {
      score += 20;
      reasons.push("Approximate amount");
    }
  }

  // ── Date (30 pts) ────────────────────────────────────────────────────────
  const d1 = expense.documentDate ? new Date(expense.documentDate) : null;
  const d2 = transaction.transactionDate ? new Date(transaction.transactionDate) : null;
  if (d1 && d2 && !isNaN(d1) && !isNaN(d2)) {
    const days = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
    if (days === 0) {
      score += 30;
      reasons.push("Same date");
    } else if (days <= 1) {
      score += 22;
      reasons.push("Date difference: 1 day");
    } else if (days <= 3) {
      score += 14;
      reasons.push(`Date difference: ${Math.round(days)} days`);
    } else if (days <= 7) {
      score += 6;
      reasons.push(`Date difference: ${Math.round(days)} days`);
    }
  }

  // ── Currency (15 pts) ────────────────────────────────────────────────────
  const expCcy = expense.currency;
  const txnCcy = transaction.billedCurrency ?? transaction.originalCurrency;
  if (expCcy && txnCcy && expCcy === txnCcy) {
    score += 15;
    reasons.push("Same currency");
  }

  // ── Vendor / description (5 pts max — supporting signal only) ────────────
  // OCR vendor extraction is unreliable. Vendor must never compensate for a
  // poor amount / date / currency match.
  const vendor = normalizeVendorName(expense.vendorName ?? "");
  const desc = normalizeVendorName(transaction.description ?? "");
  if (vendor && desc) {
    if (vendor === desc) {
      score += 5;
      reasons.push("Exact vendor match");
    } else {
      const vendorWords = vendor.split(" ").filter((w) => w.length > 2);
      if (vendorWords.length > 0) {
        const matchedWords = vendorWords.filter((w) => desc.includes(w));
        if (matchedWords.length > 0) {
          const ratio = matchedWords.length / vendorWords.length;
          let pts;
          if (ratio >= 0.75) pts = 4;
          else if (ratio >= 0.5) pts = 3;
          else if (ratio >= 0.25) pts = 2;
          else pts = 1;
          score += pts;
          reasons.push(pts >= 3 ? "Similar vendor name" : "Partial vendor match");
        }
      }
    }
  }

  return { score: Math.min(score, 100), reasons };
}


function scoreToType(score) {
  if (score >= 80) return "strong_candidate";
  if (score >= 50) return "possible_candidate";
  return null; // below threshold — do not suggest
}


/**
 * Greedily select 1:1 candidate pairs from a pre-scored, pre-sorted list.
 *
 * Each expense and each transaction appears in at most one output pair.
 * `usedExpenseIds` / `usedTxnIds` seed the already-claimed sets (confirmed matches).
 *
 * Pure function — no side effects. Exported for testing.
 *
 * @param {Array<{expense, txn, score, reasons, matchType}>} pairs  Sorted by score desc.
 * @param {Set<string>} usedExpenseIds
 * @param {Set<string>} usedTxnIds
 * @returns {Array}
 */
export function _selectCandidates(pairs, usedExpenseIds, usedTxnIds) {
  const claimedExpenseIds = new Set(usedExpenseIds);
  const claimedTxnIds = new Set(usedTxnIds);
  const candidates = [];

  for (const pair of pairs) {
    if (claimedExpenseIds.has(pair.expense.id)) continue;
    if (claimedTxnIds.has(pair.txn.id)) continue;

    claimedExpenseIds.add(pair.expense.id);
    claimedTxnIds.add(pair.txn.id);

    candidates.push({
      expenseId: pair.expense.id,
      expense: pair.expense,
      transactionId: pair.txn.id,
      transaction: pair.txn,
      score: pair.score,
      matchType: pair.matchType,
      reasons: pair.reasons,
    });
  }

  return candidates;
}


// ── Service ───────────────────────────────────────────────────────────────────

export const reconciliationService = {
  getAll() {
    return lsGetArray(STORE);
  },

  getById(id) {
    return this.getAll().find((m) => m.id === id) ?? null;
  },

  getConfirmed() {
    return this.getAll().filter((m) => m.status === "confirmed");
  },

  /** Return confirmed match for a given expense ID. */
  getMatchForExpense(expenseId) {
    return (
      this.getAll().find(
        (m) => m.expenseId === expenseId && m.status === "confirmed"
      ) ?? null
    );
  },

  /** Return confirmed match for a given transaction ID. */
  getMatchForTransaction(transactionId) {
    return (
      this.getAll().find(
        (m) => m.transactionId === transactionId && m.status === "confirmed"
      ) ?? null
    );
  },

  /**
   * Run the matching engine against the provided expenses and transactions.
   *
   * The caller is responsible for pre-filtering both lists to the relevant
   * accounting period and eligibility criteria (approved CC expenses only,
   * period-scoped statement transactions). The page already does this via
   * expenseService.getApprovedCreditCardByPeriod() and
   * transactionService.getByStatementIds().
   *
   * Guarantees:
   *   - Each expense appears in at most one suggested candidate (1:1).
   *   - Each transaction appears in at most one suggested candidate (1:1).
   *   - Already-confirmed pairs are excluded.
   *   - Previously rejected pairs are excluded (exact pair only — the expense
   *     and transaction individually remain eligible for other partners).
   *   - Soft-deleted expenses are skipped defensively.
   *   - Score < 50 → not included.
   *
   * Returns candidates sorted by score descending.
   */
  generateCandidates(expenses, transactions) {
    const allMatches = this.getAll();

    const confirmedExpenseIds = new Set(
      allMatches.filter((m) => m.status === "confirmed").map((m) => m.expenseId)
    );
    const confirmedTxnIds = new Set(
      allMatches.filter((m) => m.status === "confirmed").map((m) => m.transactionId)
    );

    // Exact pairs the user explicitly rejected — must not be re-suggested.
    // Only this specific pair is blocked; both parties remain eligible elsewhere.
    const rejectedPairs = new Set(
      allMatches
        .filter((m) => m.status === "rejected")
        .map((m) => `${m.expenseId}|${m.transactionId}`)
    );

    // Score all eligible pairs
    const pairs = [];
    for (const expense of expenses) {
      if (expense.deletedAt) continue; // defensive — caller should already exclude these
      if (confirmedExpenseIds.has(expense.id)) continue;

      for (const txn of transactions) {
        if (confirmedTxnIds.has(txn.id)) continue;
        if (rejectedPairs.has(`${expense.id}|${txn.id}`)) continue;

        const { score, reasons } = scoreMatch(expense, txn);
        const matchType = scoreToType(score);
        if (!matchType) continue;

        pairs.push({ expense, txn, score, reasons, matchType });
      }
    }

    // Sort by score descending, then apply greedy 1:1 assignment.
    // Greedy ensures the globally best pair is assigned first, preventing the
    // same transaction from appearing in multiple candidates.
    pairs.sort((a, b) => b.score - a.score);
    const candidates = _selectCandidates(pairs, confirmedExpenseIds, confirmedTxnIds);

    return candidates.sort((a, b) => b.score - a.score);
  },

  /** Confirm a match (from candidates or manually). */
  confirmMatch(expenseId, transactionId, matchType = "manual", score = 0, reasons = []) {
    // Remove any existing pending match for this expense or transaction
    const all = this.getAll().filter(
      (m) =>
        m.status !== "pending" ||
        (m.expenseId !== expenseId && m.transactionId !== transactionId)
    );

    const match = {
      id: generateId(),
      expenseId,
      transactionId,
      score,
      matchType,
      reasons,
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    all.push(match);
    lsSetArray(STORE, all);

    transactionService.updateStatus(transactionId, "matched");

    return match;
  },

  /**
   * Record a rejection for a specific expense ↔ transaction pair.
   *
   * The rejection is stored as persistent evidence so this exact pair is never
   * re-suggested. Either party remains eligible to match with other records.
   * A rejected record carries no allocated amount — it is not a financial allocation.
   */
  rejectCandidate(expenseId, transactionId) {
    const match = {
      id: generateId(),
      expenseId,
      transactionId,
      score: 0,
      matchType: "manual",
      reasons: [],
      status: "rejected",
      confirmedAt: null,
      createdAt: new Date().toISOString(),
    };
    const all = this.getAll();
    all.push(match);
    lsSetArray(STORE, all);
    return match;
  },

  /** Undo a confirmed match and reset the transaction to unmatched. */
  undoMatch(matchId) {
    const match = this.getById(matchId);
    if (!match) return;

    const all = this.getAll().filter((m) => m.id !== matchId);
    lsSetArray(STORE, all);

    transactionService.updateStatus(match.transactionId, "unmatched");
  },

  /**
   * Re-validate an existing confirmed match after an expense has been edited.
   *
   * Returns { action: 'preserved' | 'removed' | 'none', match?, invalidReason? }
   *
   * Logic:
   *   1. No confirmed match → 'none'
   *   2. Payment method changed to non-credit_card → remove ('removed')
   *   3. Matched transaction no longer exists → remove ('removed')
   *   4. Re-score:
   *      - score >= 50 → update score/reasons/matchType/revalidatedAt ('preserved')
   *      - score < 50  → remove ('removed')
   */
  revalidateMatchAfterExpenseEdit(expenseId, updatedExpense) {
    const match = this.getMatchForExpense(expenseId);
    if (!match) return { action: "none" };

    if (updatedExpense.paymentMethod && updatedExpense.paymentMethod !== "credit_card") {
      this.undoMatch(match.id);
      return {
        action: "removed",
        match,
        invalidReason: "Payment method is no longer Credit Card",
      };
    }

    const transaction = transactionService.getById(match.transactionId);
    if (!transaction) {
      const all = this.getAll().filter((m) => m.id !== match.id);
      lsSetArray(STORE, all);
      return {
        action: "removed",
        match,
        invalidReason: "Matched transaction no longer exists",
      };
    }

    const { score, reasons } = scoreMatch(updatedExpense, transaction);

    if (score < 50) {
      this.undoMatch(match.id);
      return {
        action: "removed",
        match,
        invalidReason: `Match score dropped to ${score} (minimum threshold is 50)`,
      };
    }

    const matchType = score >= 80 ? "strong_candidate" : "possible_candidate";
    const all = this.getAll().map((m) =>
      m.id === match.id
        ? { ...m, score, reasons, matchType, revalidatedAt: new Date().toISOString() }
        : m
    );
    lsSetArray(STORE, all);
    return { action: "preserved", match: all.find((m) => m.id === match.id) };
  },

  delete(id) {
    const match = this.getById(id);
    if (match?.status === "confirmed") {
      transactionService.updateStatus(match.transactionId, "unmatched");
    }
    const all = this.getAll().filter((m) => m.id !== id);
    lsSetArray(STORE, all);
  },
};
