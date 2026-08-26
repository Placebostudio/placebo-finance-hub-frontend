const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/audit_logs`;

export const auditRepository = {

    // ============================================================
    // GET ALL AUDIT LOGS
    // GET /api/audit_logs
    // ============================================================

    async getAll(filters = {}) {

        const query = new URLSearchParams();

        Object.entries(filters).forEach(([key, value]) => {

            if (
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {
                query.append(key, value);
            }

        });

        const url =
            query.toString()
                ? `${BASE_URL}?${query.toString()}`
                : BASE_URL;

        const response = await fetch(url);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get audit logs"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE AUDIT LOG
    // GET /api/audit_logs/:auditlogid
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get audit log"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE AUDIT LOG
    // POST /api/audit_logs
    //
    // Audit logs CANNOT themselves be audited.
    // ============================================================

    async create(data) {

        if (
            data?.entity_type === "audit_log" ||
            data?.entityType === "audit_log"
        ) {
            throw new Error(
                "Audit logs cannot have audit logs"
            );
        }

        const response = await fetch(BASE_URL, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Failed to create audit log"
            );
        }

        return result;
    },


    // ============================================================
    // UPDATE AUDIT LOG
    // PUT /api/audit_logs/:auditlogid
    // ============================================================

    async update(id, data) {

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
                result.error || "Failed to update audit log"
            );
        }

        return result;
    },


    // ============================================================
    // DELETE AUDIT LOG
    // DELETE /api/audit_logs/:auditlogid
    // ============================================================

    async delete(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`,
            {
                method: "DELETE"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Failed to delete audit log"
            );
        }

        return result;
    }
};