const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/document_attachments`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const documentAttachmentRepository = {

    // ============================================================
    // GET ALL DOCUMENT ATTACHMENTS
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
                "Failed to get document attachments"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE DOCUMENT ATTACHMENT
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get document attachment"
            );
        }

        return data;
    },


    // ============================================================
    // UPLOAD DOCUMENT
    //
    // POST /api/document_attachments
    //
    // Sends the actual file as multipart/form-data.
    // ============================================================

    async upload(file, uploadedBy, notes = "") {

        const formData = new FormData();

        formData.append("file", file);
        formData.append("uploaded_by", uploadedBy);

        if (notes) {
            formData.append("notes", notes);
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
                "Failed to upload document"
            );
        }

        const document =
            result.document ?? result;

        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser && document.id) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "create",

                entity_type: "document",

                entity_id: document.id,

                before: null,

                after: document,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }

        return document;
    },


    // ============================================================
    // UPDATE DOCUMENT ATTACHMENT
    // ============================================================

    async update(id, data) {

        const before =
            await this.getById(id);

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

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to update document attachment"
            );
        }

        const document =
            result.document ?? result;

        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "update",

                entity_type: "document",

                entity_id: id,

                before: before,

                after: document,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }

        return document;
    },


    // ============================================================
    // SOFT DELETE DOCUMENT
    //
    // Backend DELETE route performs:
    //
    // deleted_at = NOW()
    //
    // The physical Supabase file is NOT deleted.
    // ============================================================

    async delete(id) {

        const before =
            await this.getById(id);

        const response = await fetch(
            `${BASE_URL}/${id}`,
            {
                method: "DELETE"
            }
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to delete document"
            );
        }

        const document =
            result.document ?? result;

        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "soft_delete",

                entity_type: "document",

                entity_id: id,

                before: before,

                after: document,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }

        return result;
    },


    // ============================================================
    // GET EXTRACTIONS
    // ============================================================

    async getExtractions(id) {

        const response = await fetch(
            `${BASE_URL}/${id}/extractions`
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to get document extractions"
            );
        }

        return result;
    },


    // ============================================================
    // GET CURRENT EXTRACTION
    // ============================================================

    async getCurrentExtraction(id) {

        const response = await fetch(
            `${BASE_URL}/${id}/extractions/current`
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to get current extraction"
            );
        }

        return result;
    },


    // ============================================================
    // ADD EXTRACTION
    // ============================================================

    async addExtraction(id, data) {

        const response = await fetch(
            `${BASE_URL}/${id}/extractions`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(data)
            }
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to add document extraction"
            );
        }

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "create",

                entity_type: "document_extraction",

                entity_id: id,

                before: null,

                after: result.extraction ?? result,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }

        return result.extraction ?? result;
    }
};