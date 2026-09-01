const BASE_URL = `https://placebo-finance-hub-backend.onrender.com/api/column-mappings`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const columnMappingRepository = {

    // ============================================================
    // GET ALL COLUMN MAPPINGS
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
                "Failed to get column mappings"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE COLUMN MAPPING
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get column mapping"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE COLUMN MAPPING
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
                "Failed to create column mapping"
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

                entity_type: "column_mapping",

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
    // UPDATE COLUMN MAPPING
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

        const updatedColumnMapping = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedColumnMapping.error ||
                "Failed to update column mapping"
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

                entity_type: "column_mapping",

                entity_id: id,

                before: before,

                after: updatedColumnMapping,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedColumnMapping;
    },


    // ============================================================
    // SOFT DELETE COLUMN MAPPING
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

        const updatedColumnMapping = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedColumnMapping.error ||
                "Failed to soft delete column mapping"
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

                entity_type: "column_mapping",

                entity_id: id,

                before: before,

                after: updatedColumnMapping,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedColumnMapping;
    },


    // ============================================================
    // DELETE COLUMN MAPPING
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
                "Failed to delete column mapping"
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

                entity_type: "column_mapping",

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