const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/document-extractions`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const documentExtractionRepository = {

    // ============================================================
    // GET ALL DOCUMENT EXTRACTIONS
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
                "Failed to get document extractions"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE DOCUMENT EXTRACTION
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get document extraction"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE DOCUMENT EXTRACTION
    //
    // Uses multipart/form-data because the backend route
    // expects upload.single("file").
    // ============================================================

    async create(data, file) {

        const formData = new FormData();

        Object.entries(data || {}).forEach(([key, value]) => {

            if (
                value !== undefined &&
                value !== null
            ) {

                if (
                    typeof value === "object" &&
                    !(value instanceof File)
                ) {
                    formData.append(
                        key,
                        JSON.stringify(value)
                    );
                } else {
                    formData.append(key, value);
                }
            }
        });


        if (file) {
            formData.append("file", file);
        }


        const response = await fetch(
            BASE_URL,
            {
                method: "POST",
                body: formData
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to create document extraction"
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

                entity_type: "document_extraction",

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
    // UPDATE DOCUMENT EXTRACTION
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

        const updatedExtraction = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedExtraction.error ||
                "Failed to update document extraction"
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

                entity_type: "document_extraction",

                entity_id: id,

                before: before,

                after: updatedExtraction,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedExtraction;
    },


    // ============================================================
    // SOFT DELETE DOCUMENT EXTRACTION
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

        const updatedExtraction = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedExtraction.error ||
                "Failed to soft delete document extraction"
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

                entity_type: "document_extraction",

                entity_id: id,

                before: before,

                after: updatedExtraction,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedExtraction;
    },


    // ============================================================
    // DELETE DOCUMENT EXTRACTION
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
                "Failed to delete document extraction"
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

                entity_type: "document_extraction",

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