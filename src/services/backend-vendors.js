const BASE_URL = `https://placebo-finance-hub-backend.onrender.com/api/vendors`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const vendorRepository = {

    // ============================================================
    // GET ALL VENDORS
    // ============================================================

    async getAll(filters = {}) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id ?? null;

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

        if (userId) {
            params.set(
                "user_id",
                userId
            );
        }

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
                "Failed to get vendors"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE VENDOR
    // ============================================================

    async getById(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id ?? null;

        const params =
            new URLSearchParams();

        if (userId) {
            params.set(
                "user_id",
                userId
            );
        }

        const queryString =
            params.toString();

        const url =
            queryString
                ? `${BASE_URL}/${id}?${queryString}`
                : `${BASE_URL}/${id}`;

        const response =
            await fetch(url);

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get vendor"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE VENDOR
    // ============================================================

    async create(data) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id ?? null;

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
                "Failed to create vendor"
            );
        }

        const vendor =
            result.vendor ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (currentUser && vendor.id) {

            await auditRepository.create({

                actor_id:
                    currentUser.id,

                action:
                    "create",

                entity_type:
                    "vendor",

                entity_id:
                    vendor.id,

                before:
                    null,

                after:
                    vendor,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }

        return vendor;
    },


    // ============================================================
    // UPDATE VENDOR
    // ============================================================

    async update(id, data) {

        const before =
            await this.getById(id);

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id ?? null;

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

        const result =
            await response.json();

        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to update vendor"
            );
        }

        const updatedVendor =
            result.vendor ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (currentUser) {

            await auditRepository.create({

                actor_id:
                    currentUser.id,

                action:
                    "update",

                entity_type:
                    "vendor",

                entity_id:
                    id,

                before:
                    before,

                after:
                    updatedVendor,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }

        return updatedVendor;
    },


    // ============================================================
    // SOFT DELETE VENDOR
    // ============================================================

    async softDelete(id) {

        const before =
            await this.getById(id);

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id ?? null;

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

        const updatedVendor =
            await response.json();

        if (!response.ok) {

            throw new Error(
                updatedVendor.error ||
                "Failed to soft delete vendor"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (currentUser) {

            await auditRepository.create({

                actor_id:
                    currentUser.id,

                action:
                    "soft_delete",

                entity_type:
                    "vendor",

                entity_id:
                    id,

                before:
                    before,

                after:
                    updatedVendor,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }

        return updatedVendor;
    },


    // ============================================================
    // DELETE VENDOR
    // ============================================================

    async delete(id) {

        const before =
            await this.getById(id);

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id ?? null;

        const response =
            await fetch(
                `${BASE_URL}/${id}`,
                {
                    method: "DELETE",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        user_id: userId
                    })
                }
            );

        const result =
            await response.json();

        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to delete vendor"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (currentUser) {

            await auditRepository.create({

                actor_id:
                    currentUser.id,

                action:
                    "delete",

                entity_type:
                    "vendor",

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
        }

        return result;
    }
};