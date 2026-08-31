/**
 * Reconciliation repository — backend implementation.
 *
 * Uses expenseRepository, transactionRepository, and matchRepository to
 * communicate with the backend API.
 *
 * Scoring weights (total 100):
 *   Amount   50 pts — primary signal
 *   Date     30 pts — secondary signal
 *   Currency 15 pts — tertiary signal
 *   Vendor    5 pts — supporting hint only (OCR is unreliable for vendor names)
 */

import { expenseRepository } from "./backend-expenses.js";
import { transactionRepository } from "./backend-transactions.js";
import { matchRepository } from "./backend-matches.js";
import { normalizeVendorName } from "@/lib/utils";
import { scoreMatch } from "./reconciliation.service.js";

// ============================================================
// RECONCILIATION REPOSITORY
// ============================================================

export const reconciliationRepository = {

    // ============================================================
    // GET ALL MATCHES
    // ============================================================

    async getAllMatches() {
        return await matchRepository.getAll();
    },


    // ============================================================
    // GET CONFIRMED MATCHES
    // ============================================================

    async getConfirmedMatches() {

        const matches =
            await matchRepository.getAll();

        return matches.filter(
            (match) =>
                match.status === "confirmed" &&
                !match.spam
        );
    },


    // ============================================================
    // GET MATCH FOR EXPENSE
    // ============================================================

    async getMatchForExpense(expenseId) {

        const matches =
            await matchRepository.getByExpense(
                expenseId
            );

        return (
            matches.find(
                (match) =>
                    match.status === "confirmed" &&
                    !match.spam
            ) ?? null
        );
    },


    // ============================================================
    // GET MATCH FOR TRANSACTION
    // ============================================================

    async getMatchForTransaction(transactionId) {

        const matches =
            await matchRepository.getByTransaction(
                transactionId
            );

        return (
            matches.find(
                (match) =>
                    match.status === "confirmed" &&
                    !match.spam
            ) ?? null
        );
    },


    // ============================================================
    // GENERATE CANDIDATES
    //
    // Produces 1:1 suggestions — no expense and no transaction
    // appears in more than one candidate.
    //
    // Parameters:
    //   expenses     — pre-filtered list, or null to fetch from API
    //   transactions — pre-filtered list, or null to fetch from API
    //   period       — YYYY-MM string; applied when fetching from API
    //
    // Eligibility (when fetching internally):
    //   Expenses:     status=approved, payment_method=credit_card, not spam
    //   Transactions: transaction_type=expense, not spam
    //
    // Excluded pairs:
    //   - Already confirmed on either side
    //   - Previously rejected (exact pair only — either party can match others)
    // ============================================================

    async generateCandidates(expenses, transactions) {
        const pairs = [];

        for (const expense of expenses) {

            for (const transaction of transactions) {

                const {
                    score,
                    reasons
                } = this.scoreMatch(
                    expense,
                    transaction
                );

                const matchType =
                    this.scoreToType(score);

                if (!matchType) {
                    continue;
                }

                pairs.push({

                    expense,
                    txn: transaction,
                    score,
                    matchType,
                    reasons

                });
            }
        }

        pairs.sort(
            (a, b) =>
                b.score - a.score
        );

        return pairs;
    },


    // ============================================================
    // CONFIRM MATCH
    // ============================================================

    async confirmMatch(
        expenseId,
        transactionId,
        matchType = "manual",
        score = 0,
        reasons = [],
        allocatedAmount
    ) {
        const existingMatches =
            await matchRepository.getAll();

        // Remove pending matches involving either side
        const pendingMatches = existingMatches.filter(
            (match) =>
                match.status === "pending" &&
                (
                    match.expense_id === expenseId ||
                    match.transaction_id === transactionId
                )
        );

        for (const match of pendingMatches) {
            await matchRepository.delete(match.id);
        }

        const expense =
            await expenseRepository.getById(expenseId);

        if (!expense) {
            throw new Error("Expense not found");
        }

        const transaction =
            await transactionRepository.getById(transactionId);

        if (!transaction) {
            throw new Error("Transaction not found");
        }

        // Expense amount is positive.
        // Transaction amount is normally negative for a card charge,
        // so use the absolute value.
        const expenseAmount =
            Math.abs(Number(expense.gross_amount ?? 0));

        const transactionAmount =
            Math.abs(Number(transaction.billed_amount ?? 0));

        if (expenseAmount <= 0) {
            throw new Error("Expense has no valid gross amount");
        }

        if (transactionAmount <= 0) {
            throw new Error("Transaction has no valid billed amount");
        }

        // If no explicit allocation was supplied, use the expense amount.
        const amount =
            allocatedAmount !== undefined &&
                allocatedAmount !== null
                ? Math.abs(Number(allocatedAmount))
                : expenseAmount;

        // The allocation must not exceed either side.
        if (amount > expenseAmount) {
            throw new Error(
                "Allocation exceeds the expense gross amount"
            );
        }

        if (amount > transactionAmount) {
            throw new Error(
                "Allocation exceeds the transaction billed amount"
            );
        }

        return await matchRepository.create({
            expense_id: expenseId,

            transaction_id: transactionId,

            allocated_amount: amount,

            score,

            match_type: matchType,

            reasons,

            status: "confirmed",

            confirmed_at: new Date().toISOString()
        });
    },


    // ============================================================
    // REJECT CANDIDATE
    //
    // Records this specific expense ↔ transaction pair as rejected
    // so it is never re-suggested. Either party remains eligible to
    // match with other records.
    //
    // allocated_amount is intentionally null for rejected records —
    // a rejection is not a financial allocation.
    //
    // NOTE: The backend schema must allow allocated_amount to be NULL
    // for rejected matches. If the backend enforces NOT NULL on that
    // column, a migration is needed:
    //
    //   ALTER TABLE expense_transaction_matches
    //     ALTER COLUMN allocated_amount DROP NOT NULL;
    //
    // (The previous workaround of allocated_amount = 0.01 was
    // semantically incorrect and would corrupt coverage calculations.)
    // ============================================================

    async rejectCandidate(
        expenseId,
        transactionId
    ) {

        return await matchRepository.create({

            expense_id:
                expenseId,

            transaction_id:
                transactionId,

            allocated_amount:
                null,

            score:
                0,

            match_type:
                "manual",

            reasons:
                [],

            status:
                "rejected"
        });
    },


    // ============================================================
    // UNDO MATCH
    // ============================================================

    async undoMatch(matchId) {

        const match =
            await matchRepository.getById(
                matchId
            );


        if (!match) {
            return;
        }


        await matchRepository.delete(
            matchId
        );


        // The backend should reset the transaction status
        // when a confirmed match is deleted. Handle this in
        // the backend match controller / delete hook rather
        // than issuing a separate update from the frontend.
    },


    // ============================================================
    // REVALIDATE AFTER EXPENSE EDIT
    //
    // Re-scores an existing confirmed match after the expense
    // has been edited. Removes the match if it is no longer valid.
    // ============================================================

    async revalidateMatchAfterExpenseEdit(
        expenseId,
        updatedExpense
    ) {

        const match =
            await this.getMatchForExpense(
                expenseId
            );


        if (!match) {

            return {
                action: "none"
            };
        }


        // ========================================================
        // PAYMENT METHOD
        // ========================================================

        if (
            updatedExpense.payment_method &&
            updatedExpense.payment_method !==
            "credit_card"
        ) {

            await this.undoMatch(
                match.id
            );


            return {

                action:
                    "removed",

                match,

                invalidReason:
                    "Payment method is no longer Credit Card"
            };
        }


        // ========================================================
        // GET TRANSACTION
        // ========================================================

        const transaction =
            await transactionRepository.getById(
                match.transaction_id
            );


        if (!transaction) {

            await this.undoMatch(
                match.id
            );


            return {

                action:
                    "removed",

                match,

                invalidReason:
                    "Matched transaction no longer exists"
            };
        }


        // ========================================================
        // RESCORE
        // ========================================================

        const {
            score,
            reasons
        } =
            scoreMatch(
                updatedExpense,
                transaction
            );


        if (score < 50) {

            await this.undoMatch(
                match.id
            );


            return {

                action:
                    "removed",

                match,

                invalidReason:
                    `Match score dropped to ${score} (minimum threshold is 50)`
            };
        }


        // ========================================================
        // UPDATE MATCH
        // ========================================================

        const matchType =
            score >= 80
                ? "strong_candidate"
                : "possible_candidate";


        const updatedMatch =
            await matchRepository.update(
                match.id,
                {
                    score,
                    reasons,
                    match_type:
                        matchType,
                    revalidated_at:
                        new Date().toISOString()
                }
            );


        return {

            action:
                "preserved",

            match:
                updatedMatch
        };
    },

    // ============================================================
    // MATCH SCORING
    // ============================================================

    /**
     * Score an (expense, transaction) pair. Returns { score: 0–100, reasons: string[] }.
     * Pure function — no side effects.
     *
     * Field names use the backend snake_case convention.
     */

    scoreMatch(expense, transaction) {
        let score = 0;
        const reasons = [];

        // ============================================================
        // AMOUNT — 50 POINTS
        // ============================================================

        const expenseAmount =
            Math.abs(
                Number(expense.gross_amount ?? 0)
            );

        const transactionAmount =
            Math.abs(
                Number(
                    transaction.billed_amount ??
                    transaction.original_amount ??
                    0
                )
            );

        if (
            expenseAmount > 0 &&
            transactionAmount > 0
        ) {

            const difference =
                Math.abs(
                    expenseAmount -
                    transactionAmount
                );

            const percentage =
                difference / expenseAmount;

            if (percentage < 0.005) {

                score += 50;
                reasons.push("Exact amount match");

            } else if (percentage < 0.02) {

                score += 38;
                reasons.push("Near-exact amount");

            } else if (percentage < 0.05) {

                score += 20;
                reasons.push("Approximate amount");
            }
        }

        // ============================================================
        // DATE — 30 POINTS
        // ============================================================

        const expenseDate =
            expense.document_date
                ? new Date(`${expense.document_date}T00:00:00`)
                : null;

        const transactionDate =
            transaction.transaction_date
                ? new Date(`${transaction.transaction_date}T00:00:00`)
                : null;

        if (
            expenseDate &&
            transactionDate &&
            !isNaN(expenseDate.getTime()) &&
            !isNaN(transactionDate.getTime())
        ) {

            const days =
                Math.abs(
                    expenseDate.getTime() -
                    transactionDate.getTime()
                ) /
                (1000 * 60 * 60 * 24);

            if (days === 0) {

                score += 30;
                reasons.push("Same date");

            } else if (days <= 1) {

                score += 22;
                reasons.push("Date difference: 1 day");

            } else if (days <= 3) {

                score += 14;
                reasons.push(
                    `Date difference: ${Math.round(days)} days`
                );

            } else if (days <= 7) {

                score += 6;
                reasons.push(
                    `Date difference: ${Math.round(days)} days`
                );
            }
        }

        // ============================================================
        // CURRENCY — 15 POINTS
        // ============================================================

        const expenseCurrency =
            expense.currency;

        const transactionCurrency =
            transaction.billed_currency ??
            transaction.original_currency;

        if (
            expenseCurrency &&
            transactionCurrency &&
            expenseCurrency === transactionCurrency
        ) {

            score += 15;
            reasons.push("Same currency");
        }

        // ============================================================
        // VENDOR / DESCRIPTION — 5 POINTS
        // ============================================================

        const vendor =
            normalizeVendorName(
                expense.vendor_name ?? ""
            );

        const description =
            normalizeVendorName(
                transaction.description ?? ""
            );

        if (vendor && description) {

            if (vendor === description) {

                score += 5;
                reasons.push("Exact vendor match");

            } else {

                const vendorWords =
                    vendor
                        .split(" ")
                        .filter(
                            (word) => word.length > 2
                        );

                if (vendorWords.length > 0) {

                    const matchedWords =
                        vendorWords.filter(
                            (word) =>
                                description.includes(word)
                        );

                    if (matchedWords.length > 0) {

                        const ratio =
                            matchedWords.length /
                            vendorWords.length;

                        let points;

                        if (ratio >= 0.75) points = 4;
                        else if (ratio >= 0.5) points = 3;
                        else if (ratio >= 0.25) points = 2;
                        else points = 1;

                        score += points;

                        reasons.push(
                            points >= 3
                                ? "Similar vendor name"
                                : "Partial vendor match"
                        );
                    }
                }
            }
        }

        return {
            score: Math.min(score, 100),
            reasons
        };
    },

    // ============================================================
    // SCORE → MATCH TYPE
    // ============================================================

    scoreToType(score) {

        if (score >= 80) {
            return "strong_candidate";
        }

        if (score >= 50) {
            return "possible_candidate";
        }

        return null;
    },


    // ============================================================
    // GREEDY 1:1 CANDIDATE SELECTION
    // ============================================================

    async selectCandidates(pairs, usedExpenseIds, usedTxnIds) {
        const claimedExpenseIds =
            new Set(usedExpenseIds);

        const claimedTxnIds =
            new Set(usedTxnIds);

        const candidates = [];


        for (const pair of pairs) {

            if (
                claimedExpenseIds.has(
                    pair.expense.id
                )
            ) {
                continue;
            }

            if (
                claimedTxnIds.has(
                    pair.txn.id
                )
            ) {
                continue;
            }


            claimedExpenseIds.add(
                pair.expense.id
            );

            claimedTxnIds.add(
                pair.txn.id
            );


            candidates.push({

                expenseId:
                    pair.expense.id,

                expense:
                    pair.expense,

                transactionId:
                    pair.txn.id,

                transaction:
                    pair.txn,

                score:
                    pair.score,

                matchType:
                    pair.matchType,

                reasons:
                    pair.reasons
            });
        }


        return candidates;
    }

};
