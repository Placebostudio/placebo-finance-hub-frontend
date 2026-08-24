const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/transactions`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";


export const transactionRepository = {

    // ============================================================
    // GET ALL TRANSACTIONS
    // ============================================================

    async getAll(filters = {}) {

        const params = new URLSearchParams();

        Object.entries(filters).forEach(([key, value]) => {

            if (
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {
                params.append(key, value);
            }

        });

        const queryString = params.toString();

        const url = queryString
            ? `${BASE_URL}?${queryString}`
            : BASE_URL;


        const response = await fetch(url);

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "Failed to get transactions"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE TRANSACTION
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "Failed to get transaction"
            );
        }

        return data;
    },


    // ============================================================
    // GET TRANSACTIONS BY STATEMENT
    // ============================================================

    async getByStatement(statementId) {

        return this.getAll({
            statement_id: statementId
        });
    },


    // ============================================================
    // CREATE TRANSACTION
    // ============================================================

    async create(data) {

        const response = await fetch(
            BASE_URL,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(data)
            }
        );

        const result = await response.json();

        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to create transaction"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser && result.transaction?.id) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "create",

                entity_type: "transaction",

                entity_id: result.transaction.id,

                before: null,

                after: result.transaction,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // UPDATE TRANSACTION
    // ============================================================

    async update(id, data) {

        // Get old version BEFORE changing it
        const before = await this.getById(id);


        const response = await fetch(
            `${BASE_URL}/${id}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(data)
            }
        );

        const result = await response.json();

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

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "update",

                entity_type: "transaction",

                entity_id: id,

                before: before,

                after: updatedTransaction,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // SOFT DELETE TRANSACTION
    //
    // This is an UPDATE.
    // Only spam is changed.
    // ============================================================

    async softDelete(id) {

        // Get old version BEFORE changing it
        const before = await this.getById(id);


        const response = await fetch(
            `${BASE_URL}/${id}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    spam: true
                })
            }
        );

        const result = await response.json();

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

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "soft_delete",

                entity_type: "transaction",

                entity_id: id,

                before: before,

                after: updatedTransaction,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // DELETE TRANSACTION
    //
    // FINAL / PERMANENT DELETE
    // ============================================================

    async delete(id) {

        // Get old version BEFORE deleting
        const before = await this.getById(id);


        const response = await fetch(
            `${BASE_URL}/${id}`,
            {
                method: "DELETE"
            }
        );

        const result = await response.json();

        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to delete transaction"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "delete",

                entity_type: "transaction",

                entity_id: id,

                before: before,

                after: null,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    }
};