const BASE_URL =
    `https://placebo-finance-hub-backend.onrender.com/api/documents`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const documentRepository = {

    // ============================================================
    // GET LOGGED-IN USER
    // ============================================================

    getCurrentUser() {

        const currentUser =
            userRepository.getLoggedInUser();

        if (!currentUser?.id) {
            throw new Error(
                "No logged-in user found"
            );
        }

        return currentUser;
    },


    // ============================================================
    // UPLOAD DOCUMENT
    // ============================================================

    async upload(file, notes = "") {

        const currentUser =
            this.getCurrentUser();


        const formData =
            new FormData();


        formData.append(
            "file",
            file
        );

        formData.append(
            "uploaded_by",
            currentUser.id
        );

        formData.append(
            "user_id",
            currentUser.id
        );


        if (notes) {

            formData.append(
                "notes",
                notes
            );
        }


        const response =
            await fetch(
                BASE_URL,
                {
                    method: "POST",
                    body: formData
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to upload document"
            );
        }


        const document =
            result.document ?? result;


        // ========================================================
        // AUDIT
        // ========================================================

        if (document.id) {

            await auditRepository.create({

                actor_id:
                    currentUser.id,

                action:
                    "create",

                entity_type:
                    "document",

                entity_id:
                    document.id,

                before:
                    null,

                after:
                    document,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        return document;
    },


    // ============================================================
    // GET FILE URL
    // ============================================================

    async getFileUrl(id) {

        const currentUser =
            this.getCurrentUser();


        const params =
            new URLSearchParams();

        params.set(
            "user_id",
            currentUser.id
        );


        const response =
            await fetch(
                `${BASE_URL}/${id}/file-url?${params.toString()}`
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to get document file URL"
            );
        }


        return result.url;
    },


    // ============================================================
    // GET ALL DOCUMENTS
    // ============================================================

    async getAll(filters = {}) {

        const currentUser =
            this.getCurrentUser();


        const params =
            new URLSearchParams();


        if (filters.status) {

            params.set(
                "status",
                filters.status
            );
        }


        if (
            filters.spam !== undefined &&
            filters.spam !== null
        ) {

            params.set(
                "spam",
                String(filters.spam)
            );
        }


        params.set(
            "user_id",
            currentUser.id
        );


        const query =
            params.toString()
                ? `?${params.toString()}`
                : "";


        const response =
            await fetch(
                `${BASE_URL}${query}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to fetch documents"
            );
        }


        return data;
    },


    // ============================================================
    // GET ONE DOCUMENT
    // ============================================================

    async getById(id) {

        const currentUser =
            this.getCurrentUser();


        const params =
            new URLSearchParams();

        params.set(
            "user_id",
            currentUser.id
        );


        const response =
            await fetch(
                `${BASE_URL}/${id}?${params.toString()}`
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
    // ============================================================

    async create(data) {

        const currentUser =
            this.getCurrentUser();


        const response =
            await fetch(
                BASE_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

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
                "Failed to create document"
            );
        }


        const document =
            result.document ?? result;


        // ========================================================
        // AUDIT
        // ========================================================

        if (document.id) {

            await auditRepository.create({

                actor_id:
                    currentUser.id,

                action:
                    "create",

                entity_type:
                    "document",

                entity_id:
                    document.id,

                before:
                    null,

                after:
                    document,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        return document;
    },


    // ============================================================
    // UPDATE DOCUMENT
    // ============================================================

    async update(id, data) {

        const currentUser =
            this.getCurrentUser();


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

                    body:
                        JSON.stringify({

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
                "Failed to update document"
            );
        }


        const updatedDocument =
            result.document ?? result;


        // ========================================================
        // AUDIT
        // ========================================================

        await auditRepository.create({

            actor_id:
                currentUser.id,

            action:
                "update",

            entity_type:
                "document",

            entity_id:
                id,

            before:
                before,

            after:
                updatedDocument,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedDocument;
    },


    // ============================================================
    // SOFT DELETE DOCUMENT
    // ============================================================

    async softDelete(id) {

        const currentUser =
            this.getCurrentUser();


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

                    body:
                        JSON.stringify({

                            deleted_at:
                                new Date().toISOString(),

                            spam:
                                true,

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
                "Failed to soft delete document"
            );
        }


        const updatedDocument =
            result.document ?? result;


        // ========================================================
        // AUDIT
        // ========================================================

        await auditRepository.create({

            actor_id:
                currentUser.id,

            action:
                "soft_delete",

            entity_type:
                "document",

            entity_id:
                id,

            before:
                before,

            after:
                updatedDocument,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedDocument;
    },


    // ============================================================
    // DELETE DOCUMENT
    // ============================================================

    async delete(id) {

        const currentUser =
            this.getCurrentUser();


        const before =
            await this.getById(id);


        const params =
            new URLSearchParams();

        params.set(
            "user_id",
            currentUser.id
        );


        const response =
            await fetch(
                `${BASE_URL}/${id}?${params.toString()}`,
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
        // AUDIT
        // ========================================================

        await auditRepository.create({

            actor_id:
                currentUser.id,

            action:
                "delete",

            entity_type:
                "document",

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