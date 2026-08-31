import { auditRepository } from "./backend-audits";
import { userRepository } from "./backend-users";

const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/statements`;

export const statementRepository = {

    // ============================================================
    // GET ALL STATEMENTS
    // GET /api/statements
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
                "Failed to create statement"
            );
        }


        const statement =
            result.statement ?? result;


        // --------------------------------------------------------
        // AUDIT LOG
        // --------------------------------------------------------

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "create",

            entity_type:
                "statement",

            entity_id:
                statement.id,

            before:
                null,

            after:
                statement
        });


        return statement;
    },


    // ============================================================
    // UPDATE STATEMENT
    // PUT /api/statements/:id
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


        // Get original state for audit
        const before =
            await this.getById(id);


        if (!before) {
            throw new Error(
                "Statement not found"
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
                            userId
                    })
                }
            );


        const result =
            await response.json();


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

            actor_id:
                userId,

            action:
                "update",

            entity_type:
                "statement",

            entity_id:
                id,

            before,
            after:
                statement
        });


        return statement;
    },


    // ============================================================
    // SOFT DELETE STATEMENT
    // spam = true
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


        if (!before) {
            throw new Error(
                "Statement not found"
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
                "Failed to soft delete statement"
            );
        }


        const statement =
            result.statement ?? result;


        // --------------------------------------------------------
        // AUDIT LOG
        // --------------------------------------------------------

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "soft_delete",

            entity_type:
                "statement",

            entity_id:
                id,

            before,
            after:
                statement
        });


        return statement;
    },


    // ============================================================
    // PERMANENT DELETE STATEMENT
    // DELETE /api/statements/:id
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


        if (!before) {
            throw new Error(
                "Statement not found"
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
                "Failed to delete statement"
            );
        }


        // --------------------------------------------------------
        // AUDIT LOG
        // --------------------------------------------------------

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "delete",

            entity_type:
                "statement",

            entity_id:
                id,

            before,
            after:
                null
        });


        return result;
    }
};