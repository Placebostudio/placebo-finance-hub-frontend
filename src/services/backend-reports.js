const BASE_URL = "http://localhost:5173/api/reports";

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const reportRepository = {

    // ============================================================
    // GET ALL REPORTS
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
                data.error || "Failed to get reports"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE REPORT
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get report"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE REPORT
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
                result.error || "Failed to create report"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser && result.id) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "create",

                entity_type: "report",

                entity_id: result.id,

                before: null,

                after: result,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // UPDATE REPORT
    // ============================================================

    async update(id, data) {

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

        const updatedReport = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedReport.error ||
                "Failed to update report"
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

                action: "update",

                entity_type: "report",

                entity_id: id,

                before: before,

                after: updatedReport,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedReport;
    },


    // ============================================================
    // SOFT DELETE REPORT
    //
    // Soft delete is an UPDATE of spam only.
    // ============================================================

    async softDelete(id) {

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

        const updatedReport = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedReport.error ||
                "Failed to soft delete report"
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

                action: "soft_delete",

                entity_type: "report",

                entity_id: id,

                before: before,

                after: updatedReport,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedReport;
    },


    // ============================================================
    // DELETE REPORT
    //
    // Permanent/final delete.
    // ============================================================

    async delete(id) {

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
                "Failed to delete report"
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

                entity_type: "report",

                entity_id: id,

                before: before,

                after: null,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    },

    async getExpenseLedger() {

        const response = await fetch(
            `${BASE_URL}/expense-ledger`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get expense ledger"
            );
        }

        return data;
    }
};