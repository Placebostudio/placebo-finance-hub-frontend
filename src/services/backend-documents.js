const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/documents`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const documentRepository = {

    // ============================================================
    // UPLOAD DOCUMENT
    //
    // POST /api/documents
    //
    // Sends the actual file as multipart/form-data.
    //
    // Backend:
    //   1. Uploads file to Supabase Storage
    //   2. Creates documents row
    //   3. Deletes Storage file if DB insert fails
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
        // AUDIT DOCUMENT CREATION
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
    // GET ALL DOCUMENTS
    // ============================================================

    async getAll(filters = {}) {

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
                        value
                    );
                }
            }
        );


        const queryString =
            params.toString();


        const url = queryString
            ? `${BASE_URL}?${queryString}`
            : BASE_URL;


        const response =
            await fetch(url);


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get documents"
            );
        }


        return data;
    },


    // ============================================================
    // GET ONE DOCUMENT
    // ============================================================

    async getById(id) {

        const response =
            await fetch(
                `${BASE_URL}/${id}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get document"
            );
        }


        return data;
    },


    // ============================================================
    // CREATE DOCUMENT
    //
    // NOTE:
    // This is kept for normal JSON document creation elsewhere.
    // The upload page should use upload() instead.
    // ============================================================

    async create(data) {

        const response =
            await fetch(
                BASE_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify(data)
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to create document"
            );
        }


        const document =
            result.document ?? result;


        // ========================================================
        // AUDIT DOCUMENT CREATION
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
    // UPDATE DOCUMENT
    // ============================================================

    async update(id, data) {

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

                    body: JSON.stringify(data)
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to update document"
            );
        }


        const updatedDocument =
            result.document ?? result;


        // ========================================================
        // AUDIT DOCUMENT UPDATE
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();


        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "update",

                entity_type: "document",

                entity_id: id,

                before,

                after: updatedDocument,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedDocument;
    },


    // ============================================================
    // SOFT DELETE DOCUMENT
    // ============================================================

    async softDelete(id) {

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
                            new Date().toISOString()
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to soft delete document"
            );
        }


        const updatedDocument =
            result.document ?? result;


        // ========================================================
        // AUDIT DOCUMENT DELETION
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();


        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "soft_delete",

                entity_type: "document",

                entity_id: id,

                before,

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

        const before =
            await this.getById(id);


        const response =
            await fetch(
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


        // ========================================================
        // AUDIT DOCUMENT DELETION
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();


        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "delete",

                entity_type: "document",

                entity_id: id,

                before,

                after: null,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return result;
    }
};