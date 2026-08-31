const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/reports`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const reportRepository = {

    // ============================================================
    // GET ALL REPORTS
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
            queryString
                ? `${BASE_URL}?${queryString}`
                : BASE_URL;


        const response =
            await fetch(url);

        const data =
            await response.json();


        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get reports"
            );
        }


        return data;
    },


    // ============================================================
    // GET ONE REPORT
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
                "Failed to get report"
            );
        }


        return data;
    },


    // ============================================================
    // CREATE REPORT
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
                        user_id: userId
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to create report"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (result.id) {

            await auditRepository.create({

                actor_id:
                    userId,

                action:
                    "create",

                entity_type:
                    "report",

                entity_id:
                    result.id,

                before:
                    null,

                after:
                    result,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // UPDATE REPORT
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
                        user_id: userId
                    })
                }
            );


        const updatedReport =
            await response.json();


        if (!response.ok) {
            throw new Error(
                updatedReport.error ||
                "Failed to update report"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "update",

            entity_type:
                "report",

            entity_id:
                id,

            before:
                before,

            after:
                updatedReport,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedReport;
    },


    // ============================================================
    // SOFT DELETE REPORT
    //
    // Soft delete is an UPDATE of spam only.
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
                        spam: true,
                        user_id: userId
                    })
                }
            );


        const updatedReport =
            await response.json();


        if (!response.ok) {
            throw new Error(
                updatedReport.error ||
                "Failed to soft delete report"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "soft_delete",

            entity_type:
                "report",

            entity_id:
                id,

            before:
                before,

            after:
                updatedReport,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedReport;
    },


    // ============================================================
    // DELETE REPORT
    //
    // Permanent/final delete.
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
                "Failed to delete report"
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
                "report",

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
    },


    // ============================================================
    // GET EXPENSE LEDGER
    // ============================================================

    async getExpenseLedger() {

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
                `${BASE_URL}/expense-ledger?user_id=${encodeURIComponent(userId)}`
            );


        const data =
            await response.json();


        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get expense ledger"
            );
        }


        return data;
    }
};