import { auditRepository } from "./backend-audits";

const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/statements`;

export const statementRepository = {

    // ============================================================
    // GET ALL STATEMENTS
    // GET /api/statements
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
                data.error ||
                "Failed to get statements"
            );
        }

        return data.statements ?? data;
    },


    // ============================================================
    // GET ONE STATEMENT
    // GET /api/statements/:id
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get statement"
            );
        }

        return data.statement ?? data;
    },


    // ============================================================
    // GET DELETED / SPAM STATEMENTS
    // ============================================================

    async getAllDeleted() {

        return this.getAll({
            spam: true
        });
    },


    // ============================================================
    // CREATE STATEMENT
    // POST /api/statements
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
                "Failed to create statement"
            );
        }

        const statement =
            result.statement ?? result;

        // --------------------------------------------------------
        // AUDIT LOG
        // --------------------------------------------------------

        await auditRepository.create({
            action: "create",
            entity_type: "statement",
            entity_id: statement.id,
            before: null,
            after: statement
        });

        return statement;
    },


    // ============================================================
    // UPDATE STATEMENT
    // PUT /api/statements/:id
    // ============================================================

    async update(id, data) {

        // Get original state for audit
        const before =
            await this.getById(id);

        if (!before) {
            throw new Error(
                "Statement not found"
            );
        }

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
                "Failed to update statement"
            );
        }

        const statement =
            result.statement ?? result;

        // --------------------------------------------------------
        // AUDIT LOG
        // --------------------------------------------------------

        await auditRepository.create({
            action: "update",
            entity_type: "statement",
            entity_id: id,
            before,
            after: statement
        });

        return statement;
    },


    // ============================================================
    // SOFT DELETE STATEMENT
    // spam = true
    // ============================================================

    async softDelete(id) {

        const before =
            await this.getById(id);

        if (!before) {
            throw new Error(
                "Statement not found"
            );
        }

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
                "Failed to soft delete statement"
            );
        }

        const statement =
            result.statement ?? result;

        // --------------------------------------------------------
        // AUDIT LOG
        // --------------------------------------------------------

        await auditRepository.create({
            action: "soft_delete",
            entity_type: "statement",
            entity_id: id,
            before,
            after: statement
        });

        return statement;
    },


    // ============================================================
    // PERMANENT DELETE STATEMENT
    // DELETE /api/statements/:id
    // ============================================================

    async delete(id) {

        const before =
            await this.getById(id);

        if (!before) {
            throw new Error(
                "Statement not found"
            );
        }

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
                "Failed to delete statement"
            );
        }

        // --------------------------------------------------------
        // AUDIT LOG
        // --------------------------------------------------------

        await auditRepository.create({
            action: "delete",
            entity_type: "statement",
            entity_id: id,
            before,
            after: null
        });

        return result;
    }
};