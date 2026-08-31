const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/transactions`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";


export const transactionRepository = {

    // ============================================================
    // GET ALL TRANSACTIONS
    // ============================================================

    async getAll(filters = {}) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const params =
            new URLSearchParams();

        Object.entries(filters).forEach(
            ([key, value]) => {

                if (
                    value !== undefined &&
                    value !== null &&
                    value !== ""
                ) {
                    params.append(
                        key,
                        String(value)
                    );
                }

            }
        );


        params.set(
            "user_id",
            userId
        );


        const queryString =
            params.toString();

        const url =
            `${BASE_URL}?${queryString}`;


        const response =
            await fetch(url);


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get transactions"
            );
        }


        return data;
    },


    // ============================================================
    // GET ONE TRANSACTION
    // ============================================================

    async getById(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const response =
            await fetch(
                `${BASE_URL}/${id}?user_id=${encodeURIComponent(userId)}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get transaction"
            );
        }


        return data;
    },


    // ============================================================
    // GET TRANSACTIONS BY STATEMENT
    // ============================================================

    async getByStatement(statementId) {

        return this.getAll({
            statement_id:
                statementId
        });
    },


    // ============================================================
    // CREATE TRANSACTION
    // ============================================================

    async create(data) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const response =
            await fetch(
                BASE_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        ...data,
                        user_id:
                            userId
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to create transaction"
            );
        }


        const transaction =
            result.transaction ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (transaction?.id) {

            await auditRepository.create({

                actor_id:
                    userId,

                action:
                    "create",

                entity_type:
                    "transaction",

                entity_id:
                    transaction.id,

                before:
                    null,

                after:
                    transaction,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // CREATE BULK TRANSACTIONS
    // ============================================================

    async createBulk(
        data,
        statementId,
        statementPeriod
    ) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        // ========================================================
        // VALIDATE INPUT
        // ========================================================

        if (!statementId) {
            throw new Error(
                "statementId is required"
            );
        }

        if (!statementPeriod) {
            throw new Error(
                "statementPeriod is required"
            );
        }

        if (
            !Array.isArray(data) ||
            data.length === 0
        ) {
            throw new Error(
                "transactions must be a non-empty array"
            );
        }


        // ========================================================
        // VALIDATE TRANSACTIONS
        // ========================================================

        for (
            let i = 0;
            i < data.length;
            i++
        ) {

            const txn =
                data[i];

            if (
                !txn ||
                !txn.transaction_date ||
                !txn.description ||
                txn.billed_amount === null ||
                txn.billed_amount === undefined ||
                !txn.row_hash
            ) {

                console.error(
                    "Invalid transaction:",
                    i,
                    txn
                );

                throw new Error(
                    `Invalid transaction at index ${i}`
                );
            }
        }


        // ========================================================
        // SEND TO BACKEND
        // ========================================================

        const response =
            await fetch(
                `${BASE_URL}/bulk`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        user_id:
                            userId,

                        statementId:
                            statementId,

                        statementPeriod:
                            statementPeriod,

                        transactions:
                            data
                    })
                }
            );


        const result =
            await response.json();


        // ========================================================
        // BACKEND ERROR
        // ========================================================

        if (!response.ok) {

            console.error(
                "Bulk transaction creation failed:",
                result
            );

            throw new Error(
                result.error ||
                "Failed to create transactions"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (
            result.transactions?.length
        ) {

            for (
                const transaction
                of result.transactions
            ) {

                await auditRepository.create({

                    actor_id:
                        userId,

                    action:
                        "create",

                    entity_type:
                        "transaction",

                    entity_id:
                        transaction.id,

                    before:
                        null,

                    after: {
                        transaction
                    },

                    ip_address:
                        null,

                    user_agent:
                        navigator.userAgent
                });
            }
        }


        return result.transactions;
    },


    // ============================================================
    // UPDATE TRANSACTION
    // ============================================================

    async update(id, data) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        // Get old version BEFORE changing it
        const before =
            await this.getById(id);


        const response =
            await fetch(
                `${BASE_URL}/${id}`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        ...data,

                        user_id:
                            userId
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to update transaction"
            );
        }


        const updatedTransaction =
            result.transaction ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "update",

            entity_type:
                "transaction",

            entity_id:
                id,

            before:
                before,

            after:
                updatedTransaction,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return result;
    },


    // ============================================================
    // SOFT DELETE TRANSACTION
    // ============================================================

    async softDelete(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        // Get old version BEFORE changing it
        const before =
            await this.getById(id);


        const response =
            await fetch(
                `${BASE_URL}/${id}`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        spam:
                            true,

                        user_id:
                            userId
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to soft delete transaction"
            );
        }


        const updatedTransaction =
            result.transaction ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "soft_delete",

            entity_type:
                "transaction",

            entity_id:
                id,

            before:
                before,

            after:
                updatedTransaction,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return result;
    },


    // ============================================================
    // DELETE TRANSACTION
    // ============================================================

    async delete(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        // Get old version BEFORE deleting
        const before =
            await this.getById(id);


        const response =
            await fetch(
                `${BASE_URL}/${id}?user_id=${encodeURIComponent(userId)}`,
                {
                    method: "DELETE"
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to delete transaction"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "delete",

            entity_type:
                "transaction",

            entity_id:
                id,

            before:
                before,

            after:
                null,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return result;
    }
};