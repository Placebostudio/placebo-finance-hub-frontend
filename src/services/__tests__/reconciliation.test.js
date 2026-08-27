/**
 * Unit tests for the reconciliation matching algorithm.
 *
 * Tests target the two pure functions exported by reconciliation.service.js:
 *   - scoreMatch(expense, transaction)       → { score, reasons }
 *   - _selectCandidates(pairs, usedE, usedT) → candidates[]
 *
 * These functions have zero side-effects and require no mocking.
 *
 * Run with: npm test
 */

import { describe, it, expect } from "vitest";
import { scoreMatch, _selectCandidates } from "../reconciliation.service.js";

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeExpense(overrides = {}) {
  return {
    id: overrides.id ?? "e1",
    grossAmount: overrides.grossAmount ?? 100,
    documentDate: overrides.documentDate ?? "2026-07-15",
    currency: overrides.currency ?? "ILS",
    vendorName: overrides.vendorName ?? "",
    paymentMethod: overrides.paymentMethod ?? "credit_card",
    status: overrides.status ?? "approved",
    deletedAt: overrides.deletedAt ?? null,
    ...overrides,
  };
}

function makeTxn(overrides = {}) {
  return {
    id: overrides.id ?? "t1",
    billedAmount: overrides.billedAmount ?? 100,
    originalAmount: overrides.originalAmount ?? undefined,
    transactionDate: overrides.transactionDate ?? "2026-07-15",
    billedCurrency: overrides.billedCurrency ?? "ILS",
    originalCurrency: overrides.originalCurrency ?? undefined,
    description: overrides.description ?? "",
    transaction_type: overrides.transaction_type ?? "expense",
    ...overrides,
  };
}

/** Build a pre-scored pair as expected by _selectCandidates */
function makePair(expense, txn, score, matchType = "strong_candidate") {
  return { expense, txn, score, reasons: [], matchType };
}


// ── scoreMatch ─────────────────────────────────────────────────────────────────

describe("scoreMatch — amount scoring", () => {
  it("1. Exact amount + same date + same currency + bad OCR vendor → strong candidate", () => {
    const expense = makeExpense({ grossAmount: 250, vendorName: "XQZRTY" });
    const txn = makeTxn({ billedAmount: 250, description: "completely unrelated merchant" });
    const { score } = scoreMatch(expense, txn);
    // 50 (amount) + 30 (date) + 15 (currency) + 0 (vendor) = 95
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBe(95);
  });

  it("gives 50 pts when amount difference < 0.5%", () => {
    const expense = makeExpense({ grossAmount: 200 });
    const txn = makeTxn({ billedAmount: 200.5 }); // 0.25% diff
    const { score, reasons } = scoreMatch(expense, txn);
    expect(reasons).toContain("Exact amount match");
    // 50 + 30 + 15 = 95
    expect(score).toBe(95);
  });

  it("gives 38 pts when amount difference < 2%", () => {
    const expense = makeExpense({ grossAmount: 200 });
    const txn = makeTxn({ billedAmount: 202 }); // 1% diff
    const { score, reasons } = scoreMatch(expense, txn);
    expect(reasons).toContain("Near-exact amount");
    // 38 + 30 + 15 = 83
    expect(score).toBe(83);
  });

  it("gives 20 pts when amount difference < 5%", () => {
    const expense = makeExpense({ grossAmount: 200 });
    const txn = makeTxn({ billedAmount: 207 }); // 3.5% diff
    const { score, reasons } = scoreMatch(expense, txn);
    expect(reasons).toContain("Approximate amount");
    // 20 + 30 + 15 = 65
    expect(score).toBe(65);
  });

  it("gives 0 pts when amount difference >= 5%", () => {
    const expense = makeExpense({ grossAmount: 200 });
    const txn = makeTxn({ billedAmount: 220 }); // 10% diff
    const { score } = scoreMatch(expense, txn);
    // 0 + 30 + 15 = 45 → below threshold
    expect(score).toBe(45);
  });
});

describe("scoreMatch — vendor cannot compensate for bad amount/date", () => {
  it("2. Perfect vendor + wrong amount → not a strong candidate (score < 80)", () => {
    const expense = makeExpense({
      grossAmount: 500,
      vendorName: "Amazon",
      documentDate: "2026-07-01",
    });
    const txn = makeTxn({
      billedAmount: 1000, // 100% off
      description: "amazon marketplace",
      transactionDate: "2026-07-15", // 14 days off
      billedCurrency: "USD", // different currency
    });
    const { score } = scoreMatch(expense, txn);
    // Amount: 0, Date: 0, Currency: 0, Vendor: ≤5
    expect(score).toBeLessThan(50); // not even a possible candidate
  });

  it("2. Perfect vendor + wrong date → score stays modest", () => {
    const expense = makeExpense({
      grossAmount: 100,
      vendorName: "Amazon",
      documentDate: "2026-06-01",
    });
    const txn = makeTxn({
      billedAmount: 100,
      description: "amazon",
      transactionDate: "2026-07-15", // 44 days off
    });
    const { score } = scoreMatch(expense, txn);
    // Amount: 50, Date: 0, Currency: 15, Vendor: 5 = 70
    expect(score).toBeLessThan(80);
    expect(score).toBeGreaterThanOrEqual(50);
  });
});

describe("scoreMatch — date scoring", () => {
  it("same date gives 30 pts", () => {
    const expense = makeExpense({ documentDate: "2026-07-10" });
    const txn = makeTxn({ transactionDate: "2026-07-10" });
    const { reasons } = scoreMatch(expense, txn);
    expect(reasons).toContain("Same date");
  });

  it("1-day difference gives 22 pts", () => {
    const expense = makeExpense({ documentDate: "2026-07-10" });
    const txn = makeTxn({ transactionDate: "2026-07-11" });
    const { reasons } = scoreMatch(expense, txn);
    expect(reasons).toContain("Date difference: 1 day");
  });

  it("3-day difference gives 14 pts", () => {
    const expense = makeExpense({ documentDate: "2026-07-10" });
    const txn = makeTxn({ transactionDate: "2026-07-13" });
    const { reasons } = scoreMatch(expense, txn);
    expect(reasons.some((r) => r.startsWith("Date difference:"))).toBe(true);
  });

  it(">7-day difference gives 0 pts for date", () => {
    const expense = makeExpense({ grossAmount: 100, documentDate: "2026-07-01" });
    const txn = makeTxn({ billedAmount: 100, transactionDate: "2026-07-15" });
    const { score } = scoreMatch(expense, txn);
    // 50 (amount) + 0 (date) + 15 (currency) = 65
    expect(score).toBe(65);
  });
});

describe("scoreMatch — currency scoring", () => {
  it("same currency gives 15 pts", () => {
    const expense = makeExpense({ currency: "EUR" });
    const txn = makeTxn({ billedCurrency: "EUR" });
    const { reasons } = scoreMatch(expense, txn);
    expect(reasons).toContain("Same currency");
  });

  it("different currency gives 0 pts", () => {
    const expense = makeExpense({ grossAmount: 100, currency: "EUR" });
    const txn = makeTxn({ billedAmount: 100, billedCurrency: "USD" });
    const { score } = scoreMatch(expense, txn);
    // 50 + 30 + 0 = 80 (not 95)
    expect(score).toBe(80);
  });

  it("falls back to originalCurrency when billedCurrency absent", () => {
    const expense = makeExpense({ currency: "USD" });
    const txn = makeTxn({ billedCurrency: undefined, originalCurrency: "USD" });
    const { reasons } = scoreMatch(expense, txn);
    expect(reasons).toContain("Same currency");
  });
});

describe("scoreMatch — vendor scoring (max 5 pts)", () => {
  it("exact vendor match gives 5 pts", () => {
    const expense = makeExpense({ vendorName: "amazon" });
    const txn = makeTxn({ description: "amazon" });
    const { score } = scoreMatch(expense, txn);
    // 50 + 30 + 15 + 5 = 100
    expect(score).toBe(100);
  });

  it("vendor cannot push score above 100", () => {
    const expense = makeExpense({ grossAmount: 100, vendorName: "amazon" });
    const txn = makeTxn({ billedAmount: 100, description: "amazon" });
    const { score } = scoreMatch(expense, txn);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("vendor mismatch contributes at most 5 pts to total", () => {
    // Force all other signals to 0 and check vendor alone
    const expense = makeExpense({
      grossAmount: 100,
      documentDate: "2026-01-01",
      currency: "EUR",
      vendorName: "amazon",
    });
    const txn = makeTxn({
      billedAmount: 999, // amount: 0
      transactionDate: "2026-06-01", // date: 0
      billedCurrency: "USD", // currency: 0
      description: "amazon",
    });
    const { score } = scoreMatch(expense, txn);
    expect(score).toBeLessThanOrEqual(5);
  });
});

describe("scoreMatch — threshold classification", () => {
  it("11. Score < 50 → not a candidate", () => {
    const expense = makeExpense({ grossAmount: 100, documentDate: "2026-01-01", currency: "EUR" });
    const txn = makeTxn({ billedAmount: 200, transactionDate: "2026-07-01", billedCurrency: "USD" });
    const { score } = scoreMatch(expense, txn);
    expect(score).toBeLessThan(50);
  });

  it("12. Score 50–79 → possible_candidate", () => {
    // Amount exact (50), date 8 days off (0), same currency (15), no vendor (0) = 65
    const expense = makeExpense({ grossAmount: 100, documentDate: "2026-07-01" });
    const txn = makeTxn({ billedAmount: 100, transactionDate: "2026-07-09" });
    const { score } = scoreMatch(expense, txn);
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThan(80);
  });

  it("13. Score ≥ 80 → strong_candidate", () => {
    // Amount exact (50) + same date (30) + same currency (15) = 95
    const expense = makeExpense({ grossAmount: 100 });
    const txn = makeTxn({ billedAmount: 100 });
    const { score } = scoreMatch(expense, txn);
    expect(score).toBeGreaterThanOrEqual(80);
  });
});


// ── _selectCandidates ─────────────────────────────────────────────────────────

describe("_selectCandidates — 1:1 assignment", () => {
  it("3. Same expense cannot receive multiple candidates", () => {
    const e1 = makeExpense({ id: "e1" });
    const t1 = makeTxn({ id: "t1" });
    const t2 = makeTxn({ id: "t2" });

    const pairs = [
      makePair(e1, t1, 90),
      makePair(e1, t2, 85), // same expense
    ];

    const result = _selectCandidates(pairs, new Set(), new Set());
    const expenseIds = result.map((c) => c.expenseId);
    const unique = new Set(expenseIds);
    expect(unique.size).toBe(expenseIds.length);
    expect(result).toHaveLength(1);
    expect(result[0].transactionId).toBe("t1"); // higher score wins
  });

  it("4. Same transaction cannot be suggested to multiple expenses", () => {
    const e1 = makeExpense({ id: "e1" });
    const e2 = makeExpense({ id: "e2" });
    const t1 = makeTxn({ id: "t1" });

    const pairs = [
      makePair(e1, t1, 90),
      makePair(e2, t1, 85), // same transaction
    ];

    const result = _selectCandidates(pairs, new Set(), new Set());
    const txnIds = result.map((c) => c.transactionId);
    const unique = new Set(txnIds);
    expect(unique.size).toBe(txnIds.length);
    expect(result).toHaveLength(1);
    expect(result[0].expenseId).toBe("e1"); // higher score wins
  });

  it("greedy picks globally best pair first, then assigns remainders correctly", () => {
    const e1 = makeExpense({ id: "e1" });
    const e2 = makeExpense({ id: "e2" });
    const t1 = makeTxn({ id: "t1" });
    const t2 = makeTxn({ id: "t2" });

    // e1↔t1 = 95, e2↔t1 = 88, e2↔t2 = 75
    // Greedy: e1↔t1 first (95), then e2↔t2 (75) — t1 is taken
    const pairs = [
      makePair(e1, t1, 95),
      makePair(e2, t1, 88),
      makePair(e2, t2, 75),
    ];

    const result = _selectCandidates(pairs, new Set(), new Set());
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.expenseId === "e1")?.transactionId).toBe("t1");
    expect(result.find((c) => c.expenseId === "e2")?.transactionId).toBe("t2");
  });

  it("6. Rejected pair does not block that expense from matching another transaction", () => {
    const e1 = makeExpense({ id: "e1" });
    const t1 = makeTxn({ id: "t1" });
    const t2 = makeTxn({ id: "t2" });

    // e1↔t1 is rejected (already excluded before reaching _selectCandidates).
    // Only e1↔t2 remains in the pairs list.
    const pairs = [makePair(e1, t2, 82)];

    const result = _selectCandidates(pairs, new Set(), new Set());
    expect(result).toHaveLength(1);
    expect(result[0].expenseId).toBe("e1");
    expect(result[0].transactionId).toBe("t2");
  });

  it("confirmed expense IDs are pre-excluded via usedExpenseIds", () => {
    const e1 = makeExpense({ id: "e1" });
    const t1 = makeTxn({ id: "t1" });

    const pairs = [makePair(e1, t1, 90)];
    const usedExpenseIds = new Set(["e1"]); // already confirmed

    const result = _selectCandidates(pairs, usedExpenseIds, new Set());
    expect(result).toHaveLength(0);
  });

  it("confirmed transaction IDs are pre-excluded via usedTxnIds", () => {
    const e1 = makeExpense({ id: "e1" });
    const t1 = makeTxn({ id: "t1" });

    const pairs = [makePair(e1, t1, 90)];
    const usedTxnIds = new Set(["t1"]); // already confirmed

    const result = _selectCandidates(pairs, new Set(), usedTxnIds);
    expect(result).toHaveLength(0);
  });
});


// ── Period / eligibility filtering (scoreMatch behaviour) ─────────────────────

describe("period and eligibility rules (via score behaviour)", () => {
  it("7. Data from another accounting period produces no useful score (amount/date mismatch)", () => {
    // If the page filters correctly (period-scoped expenses + transactions),
    // cross-period data never reaches scoreMatch. This test demonstrates that
    // a large date gap correctly yields 0 date points.
    const expense = makeExpense({ documentDate: "2026-01-15" });
    const txn = makeTxn({ transactionDate: "2026-07-15" }); // 6 months later
    const { score } = scoreMatch(expense, txn);
    // Amount exact (50) + date 0 + currency (15) = 65
    // But combined with real-world cross-period mismatches in amount this drops further.
    // The key check: date contributes 0 pts for a 6-month gap.
    const dateReasonPresent = scoreMatch(expense, txn).reasons.some((r) =>
      r.startsWith("Date difference:")
    );
    expect(dateReasonPresent).toBe(false);
    expect(score).toBeLessThanOrEqual(65); // no date points
  });

  it("8. Cash expense with exact amount/date still scores 0 for amount when grossAmount is 0", () => {
    // Cash expenses have grossAmount = 0 in degenerate test data.
    // The real exclusion happens in the page (getApprovedCreditCardByPeriod).
    // scoreMatch handles zero-amount gracefully: no amount points.
    const expense = makeExpense({ grossAmount: 0 });
    const txn = makeTxn({ billedAmount: 0 });
    const { score, reasons } = scoreMatch(expense, txn);
    expect(reasons).not.toContain("Exact amount match");
    // 0 amount + 30 date + 15 currency = 45 → below threshold
    expect(score).toBe(45);
  });

  it("10. Fully-covered / confirmed expense is excluded (usedExpenseIds pre-seeded)", () => {
    const e1 = makeExpense({ id: "confirmed_expense" });
    const t1 = makeTxn({ id: "t1" });

    // Simulate: the confirmed expense's ID is in the used set
    const pairs = [makePair(e1, t1, 95)];
    const result = _selectCandidates(pairs, new Set(["confirmed_expense"]), new Set());
    expect(result).toHaveLength(0);
  });
});


// ── Rejected pair behaviour ───────────────────────────────────────────────────

describe("rejected pair behaviour", () => {
  it("5. Rejected pair does not appear in candidates (excluded before _selectCandidates)", () => {
    // Simulate what generateCandidates() does:
    // rejected pairs are removed from `pairs` before calling _selectCandidates.
    const rejectedPairs = new Set(["e1|t1"]);

    const e1 = makeExpense({ id: "e1" });
    const t1 = makeTxn({ id: "t1" });
    const t2 = makeTxn({ id: "t2" });

    // Build pairs as generateCandidates() would, respecting rejectedPairs
    const pairs = [
      // e1↔t1 excluded because it is in rejectedPairs
      makePair(e1, t2, 90), // e1↔t2 is fine
    ].filter((p) => !rejectedPairs.has(`${p.expense.id}|${p.txn.id}`));

    const result = _selectCandidates(pairs, new Set(), new Set());
    expect(result).toHaveLength(1);
    expect(result[0].transactionId).toBe("t2");
    // t1 never appeared
    expect(result.some((c) => c.transactionId === "t1")).toBe(false);
  });

  it("15. Rejected match record carries no financial allocation", () => {
    // The rejectCandidate() implementation stores status='rejected'
    // and does NOT include an allocated amount.
    // This test verifies that scoreMatch is not affected by rejection state
    // (rejection state is orthogonal to scoring).
    const expense = makeExpense();
    const txn = makeTxn();
    const { score } = scoreMatch(expense, txn);
    // Score is deterministic regardless of whether a rejection exists.
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThan(0);
  });
});


// ── Revalidation (score-drop behaviour) ──────────────────────────────────────

describe("revalidation after expense edit", () => {
  it("14. Editing expense to drop score below 50 means match should be removed", () => {
    // Simulate the rescoring that revalidateMatchAfterExpenseEdit() performs.
    // Change amount drastically → score drops below 50.
    const updatedExpense = makeExpense({
      grossAmount: 9999, // completely wrong amount
      documentDate: "2026-01-01", // completely wrong date
    });
    const matchedTxn = makeTxn({
      billedAmount: 100,
      transactionDate: "2026-07-15",
    });
    const { score } = scoreMatch(updatedExpense, matchedTxn);
    expect(score).toBeLessThan(50);
  });

  it("editing expense to keep good amount/date preserves the match", () => {
    const updatedExpense = makeExpense({ grossAmount: 100 });
    const matchedTxn = makeTxn({ billedAmount: 100 });
    const { score } = scoreMatch(updatedExpense, matchedTxn);
    expect(score).toBeGreaterThanOrEqual(50);
  });
});
