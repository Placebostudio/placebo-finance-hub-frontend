const BASE_URL =
    `https://placebo-finance-hub-backend.onrender.com/api/categories`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const categoryRepository = {

    // ============================================================
    // GET ALL CATEGORIES
    // ============================================================

    async getAll(filters = {}) {

        const currentUser =
            userRepository.getLoggedInUser();

        if (!currentUser) {
            throw new Error(
                "No logged-in user found"
            );
        }

        const params =
            new URLSearchParams();

        params.set(
            "user_id",
            currentUser.id
        );

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
                "Failed to get categories"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE CATEGORY
    // ============================================================

    async getById(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        if (!currentUser) {
            throw new Error(
                "No logged-in user found"
            );
        }

        const response =
            await fetch(
                `${BASE_URL}/${id}?user_id=${encodeURIComponent(currentUser.id)}`
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get category"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE CATEGORY
    // ============================================================

    async create(data) {

        const currentUser =
            userRepository.getLoggedInUser();

        if (!currentUser) {
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
                            currentUser.id
                    })
                }
            );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to create category"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (result.id) {

            await auditRepository.create({

                actor_id:
                    currentUser.id,

                action:
                    "create",

                entity_type:
                    "category",

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
    // UPDATE CATEGORY
    // ============================================================

    async update(id, data) {

        const currentUser =
            userRepository.getLoggedInUser();

        if (!currentUser) {
            throw new Error(
                "No logged-in user found"
            );
        }

        // Get old version before changing it
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
                            currentUser.id
                    })
                }
            );

        const updatedCategory =
            await response.json();

        if (!response.ok) {
            throw new Error(
                updatedCategory.error ||
                "Failed to update category"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                currentUser.id,

            action:
                "update",

            entity_type:
                "category",

            entity_id:
                id,

            before:
                before,

            after:
                updatedCategory,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedCategory;
    },


    // ============================================================
    // SOFT DELETE CATEGORY
    // ============================================================

    async softDelete(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        if (!currentUser) {
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

                        user_id:
                            currentUser.id
                    })
                }
            );

        const updatedCategory =
            await response.json();

        if (!response.ok) {
            throw new Error(
                updatedCategory.error ||
                "Failed to soft delete category"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                currentUser.id,

            action:
                "soft_delete",

            entity_type:
                "category",

            entity_id:
                id,

            before:
                before,

            after:
                updatedCategory,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedCategory;
    },


    // ============================================================
    // DELETE CATEGORY
    // ============================================================

    async delete(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        if (!currentUser) {
            throw new Error(
                "No logged-in user found"
            );
        }

        const before =
            await this.getById(id);


        const response =
            await fetch(
                `${BASE_URL}/${id}?user_id=${encodeURIComponent(currentUser.id)}`,
                {
                    method: "DELETE"
                }
            );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to delete category"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                currentUser.id,

            action:
                "delete",

            entity_type:
                "category",

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