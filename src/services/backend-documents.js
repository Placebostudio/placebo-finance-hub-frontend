const BASE_URL = "http://localhost:5173/api/documents";

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";
import { documentAttachmentRepository } from "./backend-document_attachments.js";

export const documentRepository = {

    // ============================================================
    // GET ALL DOCUMENTS
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
                data.error || "Failed to get documents"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE DOCUMENT
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get document"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE DOCUMENT
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
                result.error || "Failed to create document"
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

                entity_type: "document",

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
    // UPDATE DOCUMENT
    // ============================================================

    async update(id, data) {

        // Get the old version BEFORE changing it
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

        const updatedDocument = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedDocument.error ||
                "Failed to update document"
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

                entity_type: "document",

                entity_id: id,

                before: before,

                after: updatedDocument,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedDocument;
    },


    // ============================================================
    // DELETE DOCUMENT
    // ============================================================

    async delete(id) {

        // ============================================================
        // GET DOCUMENT BEFORE DELETING
        // ============================================================

        const before = await this.getById(id);


        // ============================================================
        // GET ALL ATTACHMENTS BELONGING TO DOCUMENT
        // ============================================================

        const attachments =
            await documentAttachmentRepository.getAll({
                document_id: id
            });


        // ============================================================
        // DELETE ATTACHMENTS THROUGH THEIR API ROUTES
        // ============================================================

        for (const attachment of attachments) {

            await documentAttachmentRepository.delete(
                attachment.id
            );
        }


        // ============================================================
        // DELETE DOCUMENT
        // ============================================================

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
                "Failed to delete document"
            );
        }


        // ============================================================
        // AUDIT DOCUMENT DELETION
        // ============================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "delete",

                entity_type: "document",

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