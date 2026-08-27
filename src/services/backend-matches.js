const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/matches`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";


export const matchRepository = {

    // ============================================================
    // GET ALL MATCHES
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
                data.error || "Failed to get matches"
            );
        }

        return data;
    },

    // ============================================================
    // GET ONE MATCH
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "Failed to get match"
            );
        }

        return data;
    },


    // ============================================================
    // GET MATCHES BY EXPENSE
    // ============================================================

    async getByExpense(expenseId) {

        const response = await fetch(
            `${BASE_URL}/expense/${expenseId}`
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get matches for expense"
            );
        }

        return data;
    },


    // ============================================================
    // GET MATCHES BY TRANSACTION
    // ============================================================

    async getByTransaction(transactionId) {

        const response = await fetch(
            `${BASE_URL}/transaction/${transactionId}`
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get matches for transaction"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE MATCH
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
                result.error || "Failed to create match"
            );
        }


        const match =
            result.match ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser && match.id) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "create",

                entity_type: "match",

                entity_id: match.id,

                before: null,

                after: match,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // UPDATE MATCH
    // ============================================================

    async update(id, data) {

        const before =
            await this.getById(id);


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
                result.error || "Failed to update match"
            );
        }


        const updatedMatch =
            result.match ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "update",

                entity_type: "match",

                entity_id: id,

                before: before,

                after: updatedMatch,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // SOFT DELETE MATCH
    //
    // Soft delete is an UPDATE.
    // Only spam is changed.
    // ============================================================

    async softDelete(id) {

        const before =
            await this.getById(id);


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
                "Failed to soft delete match"
            );
        }


        const updatedMatch =
            result.match ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "soft_delete",

                entity_type: "match",

                entity_id: id,

                before: before,

                after: updatedMatch,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // DELETE MATCH
    //
    // FINAL / PERMANENT DELETE
    // ============================================================

    async delete(id) {

        const before =
            await this.getById(id);


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
                "Failed to delete match"
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

                entity_type: "match",

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