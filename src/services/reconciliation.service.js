/**
 * Reconciliation service — manages matches between expense records and transactions.
 *
 * Match statuses: confirmed | rejected | pending
 * Match types: strong_candidate | possible_candidate | manual
 *
 * The matching algorithm is deterministic and purely rule-based (no AI).
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { generateId, normalizeVendorName } from "@/lib/utils";
import { transactionService } from "./transaction.service";

const STORE = "matches";

// ── Matching algorithm ────────────────────────────────────────────────────────

/**
 * Score an (expense, transaction) pair. Returns 0–100 + reasons array.
 *
 * Weights:
 *   Amount match   40 pts
 *   Date proximity 30 pts
 *   Vendor match   20 pts
 *   Currency match  5 pts
 *   Card match      5 pts
 */
export function scoreMatch(expense, transaction) {
  let score = 0;
  const reasons = [];

  // Amount (40 pts)
  const expenseAmt = Math.abs(expense.grossAmount ?? 0);
  const txnAmt = Math.abs(transaction.billedAmount ?? transaction.originalAmount ?? 0);
  if (expenseAmt > 0 && txnAmt > 0) {
    const diff = Math.abs(expenseAmt - txnAmt);
    const pct = diff / expenseAmt;
    if (pct < 0.005) {
      score += 40;
      reasons.push("Exact amount match");
    } else if (pct < 0.02) {
      score += 30;
      reasons.push("Near-exact amount");
    } else if (pct < 0.05) {
      score += 15;
      reasons.push("Approximate amount");
    }
  }

  // Date (30 pts) — compare documentDate vs transactionDate
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

  // Vendor (20 pts)
  const vendor = normalizeVendorName(expense.vendorName ?? "");
  const desc = normalizeVendorName(transaction.description ?? "");
  if (vendor && desc) {
    // Check if either contains the other, or if significant words overlap
    const vendorWords = vendor.split(" ").filter((w) => w.length > 2);
    const matched = vendorWords.filter(
      (w) => desc.includes(w) || vendor.includes(normalizeVendorName(desc))
    );
    if (vendor === desc) {
      score += 20;
      reasons.push("Exact vendor match");
    } else if (matched.length > 0) {
      const ratio = matched.length / Math.max(vendorWords.length, 1);
      const pts = Math.round(20 * ratio);
      score += pts;
      if (pts >= 10) reasons.push("Similar vendor name");
      else reasons.push("Partial vendor match");
    }
  }

  // Currency (5 pts)
  const expCcy = expense.currency;
  const txnCcy = transaction.billedCurrency ?? transaction.originalCurrency;
  if (expCcy && txnCcy && expCcy === txnCcy) {
    score += 5;
    reasons.push("Same currency");
  }

  // Card last four (5 pts) — if expense stores card info somehow
  // (future: allow expense to store card last four)

  return { score: Math.min(score, 100), reasons };
}

function scoreToType(score) {
  if (score >= 80) return "strong_candidate";
  if (score >= 50) return "possible_candidate";
  return null; // below threshold — not a candidate
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

  /** Return match for a given expense ID, if confirmed */
  getMatchForExpense(expenseId) {
    return this.getAll().find(
      (m) => m.expenseId === expenseId && m.status === "confirmed"
    ) ?? null;
  },

  /** Return match for a given transaction ID, if confirmed */
  getMatchForTransaction(transactionId) {
    return this.getAll().find(
      (m) => m.transactionId === transactionId && m.status === "confirmed"
    ) ?? null;
  },

  /**
   * Run the matching engine against provided expenses and transactions.
   * Returns an array of candidate pairs (not saved).
   * Only suggests matches that aren't already confirmed.
   */
  generateCandidates(expenses, transactions) {
    const confirmed = this.getAll().filter((m) => m.status === "confirmed");
    const matchedExpenseIds = new Set(confirmed.map((m) => m.expenseId));
    const matchedTxnIds = new Set(confirmed.map((m) => m.transactionId));

    const candidates = [];

    for (const expense of expenses) {
      if (matchedExpenseIds.has(expense.id)) continue;

      let best = null;

      for (const txn of transactions) {
        if (matchedTxnIds.has(txn.id)) continue;
        const { score, reasons } = scoreMatch(expense, txn);
        const matchType = scoreToType(score);
        if (!matchType) continue;
        if (!best || score > best.score) {
          best = { score, reasons, matchType, txn };
        }
      }

      if (best) {
        candidates.push({
          expenseId: expense.id,
          expense,
          transactionId: best.txn.id,
          transaction: best.txn,
          score: best.score,
          matchType: best.matchType,
          reasons: best.reasons,
        });
      }
    }

    return candidates.sort((a, b) => b.score - a.score);
  },

  /** Confirm a match (from candidates or manually) */
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

    // Update transaction status
    transactionService.updateStatus(transactionId, "matched");

    return match;
  },

  /** Reject a candidate */
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

  /** Undo a confirmed match */
  undoMatch(matchId) {
    const match = this.getById(matchId);
    if (!match) return;

    const all = this.getAll().filter((m) => m.id !== matchId);
    lsSetArray(STORE, all);

    // Reset transaction status
    transactionService.updateStatus(match.transactionId, "unmatched");
  },

  /**
   * Re-validate an existing confirmed match after an expense has been edited.
   *
   * Returns { action: 'preserved' | 'removed' | 'none', match?, invalidReason? }
   *
   * Logic:
   *   1. If no confirmed match exists → 'none'
   *   2. If payment method is now non-credit_card → remove match ('removed')
   *   3. Re-score vs matched transaction:
   *      - score >= 50 → update score in place ('preserved')
   *      - score < 50  → remove match ('removed')
   */
  revalidateMatchAfterExpenseEdit(expenseId, updatedExpense) {
    const match = this.getMatchForExpense(expenseId);
    if (!match) return { action: "none" };

    // Payment method no longer credit_card → expense is ineligible for CC reconciliation
    if (updatedExpense.paymentMethod && updatedExpense.paymentMethod !== "credit_card") {
      this.undoMatch(match.id);
      return {
        action: "removed",
        match,
        invalidReason: "Payment method is no longer Credit Card",
      };
    }

    // Look up the matched transaction
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

    // Re-score
    const { score, reasons } = scoreMatch(updatedExpense, transaction);

    if (score < 50) {
      this.undoMatch(match.id);
      return {
        action: "removed",
        match,
        invalidReason: `Match score dropped to ${score} (minimum threshold is 50)`,
      };
    }

    // Still valid — update score and reasons in place
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
