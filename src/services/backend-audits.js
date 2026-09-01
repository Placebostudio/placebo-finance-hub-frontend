import { userRepository } from "./backend-users";

const BASE_URL =
    `https://placebo-finance-hub-backend.onrender.com/api/audit_logs`;

export const auditRepository = {

    // ============================================================
    // GET ALL AUDIT LOGS
    // GET /api/audit_logs?user_id=...
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

        const query =
            new URLSearchParams();

        query.set(
            "user_id",
            userId
        );

        Object.entries(filters).forEach(
            ([key, value]) => {

                if (
                    value !== undefined &&
                    value !== null &&
                    value !== ""
                ) {
                    query.append(
                        key,
                        String(value)
                    );
                }
            }
        );

        const url =
            `${BASE_URL}?${query.toString()}`;

        const response =
            await fetch(url);

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get audit logs"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE AUDIT LOG
    // GET /api/audit_logs/:auditlogid?user_id=...
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
                "Failed to get audit log"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE AUDIT LOG
    // POST /api/audit_logs
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

        if (
            data?.entity_type === "audit_log" ||
            data?.entityType === "audit_log"
        ) {
            throw new Error(
                "Audit logs cannot have audit logs"
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
                            userId,

                        actor_id:
                            userId
                    })
                }
            );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to create audit log"
            );
        }

        return result;
    },


    // ============================================================
    // UPDATE AUDIT LOG
    // PUT /api/audit_logs/:auditlogid
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
                            userId,

                        actor_id:
                            userId
                    })
                }
            );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to update audit log"
            );
        }

        return result;
    },


    // ============================================================
    // DELETE AUDIT LOG
    // DELETE /api/audit_logs/:auditlogid?user_id=...
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
                "Failed to delete audit log"
            );
        }

        return result;
    }
};