const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/expenses`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const expenseRepository = {

    // ============================================================
    // GET ALL EXPENSES
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
                data.error || "Failed to get expenses"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE EXPENSE
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get expense"
            );
        }

        return data;
    },

    async getByDocumentId(documentId) {
        const response = await fetch(
            `${BASE_URL}/document/${documentId}`
        );

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Failed to load expense");
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
                result.error || "Failed to create expense"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        const expense =
            result.expense ?? result;

        if (currentUser && expense.id) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "create",

                entity_type: "expense",

                entity_id: expense.id,

                before: null,

                after: expense,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return expense;
    },


    // ============================================================
    // UPDATE EXPENSE
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
                "Failed to update expense"
            );
        }


        const updatedExpense =
            result.expense ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "update",

                entity_type: "expense",

                entity_id: id,

                before: before,

                after: updatedExpense,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedExpense;
    },


    // ============================================================
    // SOFT DELETE EXPENSE
    // ============================================================
    //
    // Soft delete is an UPDATE.
    //
    // Sends:
    // {
    //     deleted_at: current timestamp
    // }
    //
    // ============================================================

    async softDelete(id) {

        // Get old version BEFORE changing it
        const before = await this.getById(id);


        // ========================================================
        // UPDATE EXPENSE
        // ========================================================

        const response = await fetch(
            `${BASE_URL}/${id}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    deleted_at: new Date().toISOString()
                })
            }
        );

        const result = await response.json();

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

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "soft_delete",

                entity_type: "expense",

                entity_id: id,

                before: before,

                after: updatedExpense,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedExpense;
    },


    // ============================================================
    // DELETE EXPENSE
    // ============================================================
    //
    // This is the FINAL / HARD DELETE.
    //
    // ============================================================

    async delete(id) {

        // Get old version BEFORE deleting
        const before = await this.getById(id);


        // ========================================================
        // DELETE EXPENSE
        // ========================================================

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
                "Failed to delete expense"
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

                entity_type: "expense",

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