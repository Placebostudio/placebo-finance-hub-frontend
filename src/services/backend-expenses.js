const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/expenses`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const expenseRepository = {

    // ============================================================
    // GET ALL EXPENSES
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

        params.set(
            "user_id",
            userId
        );

        if (filters.vendor_id) {
            params.set(
                "vendor_id",
                filters.vendor_id
            );
        }

        if (filters.period) {
            params.set(
                "period",
                filters.period
            );
        }

        if (
            filters.spam !== undefined &&
            filters.spam !== null
        ) {
            params.set(
                "spam",
                String(filters.spam)
            );
        }

        const response =
            await fetch(
                `${BASE_URL}?${params.toString()}`
            );


        if (!response.ok) {

            const data =
                await response.json()
                    .catch(() => ({}));

            throw new Error(
                data.error ||
                "Failed to fetch expenses"
            );
        }


        return response.json();
    },


    // ============================================================
    // GET ONE EXPENSE
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
                "Failed to get expense"
            );
        }


        return data;
    },


    // ============================================================
    // GET EXPENSE BY DOCUMENT ID
    // ============================================================

    async getByDocumentId(documentId) {

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
                `${BASE_URL}/document/${documentId}?user_id=${encodeURIComponent(userId)}`
            );


        if (response.status === 404) {
            return null;
        }


        if (!response.ok) {

            const data =
                await response.json()
                    .catch(() => ({}));

            throw new Error(
                data.error ||
                "Failed to load expense"
            );
        }


        return response.json();
    },


    // ============================================================
    // GET EXPENSES BY VENDOR
    // ============================================================

    async getByVendor(vendorId) {

        return await this.getAll({
            vendor_id: vendorId
        });
    },


    // ============================================================
    // CREATE EXPENSE
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
                "Failed to create expense"
            );
        }


        const expense =
            result.expense ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (expense.id) {

            await auditRepository.create({

                actor_id:
                    userId,

                action:
                    "create",

                entity_type:
                    "expense",

                entity_id:
                    expense.id,

                before:
                    null,

                after:
                    expense,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        return expense;
    },


    // ============================================================
    // UPDATE EXPENSE
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
                "Failed to update expense"
            );
        }


        const updatedExpense =
            result.expense ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "update",

            entity_type:
                "expense",

            entity_id:
                id,

            before:
                before,

            after:
                updatedExpense,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedExpense;
    },


    // ============================================================
    // SOFT DELETE EXPENSE
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

                        deleted_at:
                            new Date().toISOString(),

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
                "Failed to soft delete expense"
            );
        }


        const updatedExpense =
            result.expense ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "soft_delete",

            entity_type:
                "expense",

            entity_id:
                id,

            before:
                before,

            after:
                updatedExpense,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedExpense;
    },


    // ============================================================
    // HARD DELETE EXPENSE
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
                "Failed to delete expense"
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
                "expense",

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