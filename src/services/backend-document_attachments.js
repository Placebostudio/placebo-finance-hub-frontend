const BASE_URL = "http://localhost:5173/api/document_attachments";

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
                data.error || "Failed to get document attachments"
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
                data.error || "Failed to get document attachment"
            );
        }

        return data;
    },


    // ============================================================
    // ADD DOCUMENT ATTACHMENT
    // ============================================================
    //
    // data should be a FormData object containing:
    //
    // file
    // document_id
    // uploaded_by
    //
    // ============================================================

    async create(data) {

        const response = await fetch(
            BASE_URL,
            {
                method: "POST",
                body: data
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to create document attachment"
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

                entity_type: "document_attachment",

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
    // UPDATE DOCUMENT ATTACHMENT
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

        const updatedAttachment = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedAttachment.error ||
                "Failed to update document attachment"
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

                entity_type: "document_attachment",

                entity_id: id,

                before: before,

                after: updatedAttachment,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedAttachment;
    },


    // ============================================================
    // DELETE DOCUMENT ATTACHMENT
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
                "Failed to delete document attachment"
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

                entity_type: "document_attachment",

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