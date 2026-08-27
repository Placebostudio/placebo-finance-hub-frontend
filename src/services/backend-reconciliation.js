import { expenseRepository } from "./backend-expenses.js";
import { transactionRepository } from "./backend-transactions.js";
import { matchRepository } from "./backend-matches.js";
import { normalizeVendorName } from "@/lib/utils";


// ============================================================
// MATCH SCORING
// ============================================================

export function scoreMatch(expense, transaction) {

    let score = 0;
    const reasons = [];


    // ============================================================
    // AMOUNT — 40 POINTS
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

            score += 40;
            reasons.push("Exact amount match");

        } else if (percentage < 0.02) {

            score += 30;
            reasons.push("Near-exact amount");

        } else if (percentage < 0.05) {

            score += 15;
            reasons.push("Approximate amount");
        }
    }


    // ============================================================
    // DATE — 30 POINTS
    // ============================================================

    const expenseDate =
        expense.document_date
            ? new Date(expense.document_date)
            : null;

    const transactionDate =
        transaction.transaction_date
            ? new Date(transaction.transaction_date)
            : null;


    if (
        expenseDate &&
        transactionDate &&
        !isNaN(expenseDate) &&
        !isNaN(transactionDate)
    ) {

        const days =
            Math.abs(
                expenseDate - transactionDate
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
    // VENDOR — 20 POINTS
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

        const vendorWords =
            vendor
                .split(" ")
                .filter(
                    (word) => word.length > 2
                );


        const matched =
            vendorWords.filter(
                (word) =>
                    description.includes(word) ||
                    vendor.includes(
                        normalizeVendorName(description)
                    )
            );


        if (vendor === description) {

            score += 20;
            reasons.push("Exact vendor match");

        } else if (matched.length > 0) {

            const ratio =
                matched.length /
                Math.max(
                    vendorWords.length,
                    1
                );

            const points =
                Math.round(20 * ratio);

            score += points;


            if (points >= 10) {

                reasons.push(
                    "Similar vendor name"
                );

            } else {

                reasons.push(
                    "Partial vendor match"
                );
            }
        }
    }


    // ============================================================
    // CURRENCY — 5 POINTS
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

        score += 5;
        reasons.push("Same currency");
    }


    // ============================================================
    // CARD — 5 POINTS
    //
    // Currently no card-last-four field is available
    // in the backend expense schema.
    // ============================================================


    return {
        score: Math.min(score, 100),
        reasons
    };
}


// ============================================================
// SCORE → MATCH TYPE
// ============================================================

function scoreToType(score) {

    if (score >= 80) {
        return "strong_candidate";
    }

    if (score >= 50) {
        return "possible_candidate";
    }

    return null;
}


// ============================================================
// RECONCILIATION
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
    // Uses backend expenses + backend transactions.
    // Candidates are NOT saved.
    // ============================================================

    async generateCandidates(
        expenses = null,
        transactions = null
    ) {

        if (!expenses) {

            expenses =
                await expenseRepository.getAll();
        }


        if (!transactions) {

            transactions =
                await transactionRepository.getAll();
        }


        const matches =
            await matchRepository.getAll();


        // Existing confirmed matches
        const confirmed =
            matches.filter(
                (match) =>
                    match.status === "confirmed" &&
                    !match.spam
            );


        const matchedExpenseIds =
            new Set(
                confirmed.map(
                    (match) =>
                        match.expense_id
                )
            );


        const matchedTransactionIds =
            new Set(
                confirmed.map(
                    (match) =>
                        match.transaction_id
                )
            );


        const candidates = [];


        for (const expense of expenses) {

            if (expense.spam) continue;

            if (
                matchedExpenseIds.has(
                    expense.id
                )
            ) {
                continue;
            }


            let best = null;


            for (const transaction of transactions) {

                if (transaction.spam) {
                    continue;
                }


                if (
                    matchedTransactionIds.has(
                        transaction.id
                    )
                ) {
                    continue;
                }


                const {
                    score,
                    reasons
                } =
                    scoreMatch(
                        expense,
                        transaction
                    );


                const matchType =
                    scoreToType(score);


                if (!matchType) {
                    continue;
                }


                if (
                    !best ||
                    score > best.score
                ) {

                    best = {
                        score,
                        reasons,
                        matchType,
                        transaction
                    };
                }
            }


            if (best) {

                candidates.push({

                    expenseId:
                        expense.id,

                    expense,

                    transactionId:
                        best.transaction.id,

                    transaction:
                        best.transaction,

                    score:
                        best.score,

                    matchType:
                        best.matchType,

                    reasons:
                        best.reasons
                });
            }
        }


        return candidates.sort(
            (a, b) =>
                b.score - a.score
        );
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
        const pendingMatches =
            existingMatches.filter(
                (match) =>
                    match.status === "pending" &&
                    (
                        match.expense_id === expenseId ||
                        match.transaction_id === transactionId
                    )
            );


        for (const match of pendingMatches) {

            await matchRepository.delete(
                match.id
            );
        }


        const expense =
            await expenseRepository.getById(
                expenseId
            );


        if (!expense) {
            throw new Error(
                "Expense not found"
            );
        }


        const amount =
            allocatedAmount ??
            Math.abs(
                Number(
                    expense.gross_amount
                )
            );


        return await matchRepository.create({

            expense_id:
                expenseId,

            transaction_id:
                transactionId,

            allocated_amount:
                amount,

            score,

            match_type:
                matchType,

            reasons,

            status:
                "confirmed",

            confirmed_at:
                new Date().toISOString()
        });
    },


    // ============================================================
    // REJECT CANDIDATE
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
                0.01,

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


        // The backend should be responsible for
        // changing transaction status when appropriate.
        //
        // If your transaction controller does not currently
        // have a status endpoint, add one there rather than
        // modifying the transaction directly here.
    },


    // ============================================================
    // REVALIDATE AFTER EXPENSE EDIT
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
    }
};