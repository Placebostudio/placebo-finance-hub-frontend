const BASE_URL = "http://localhost:5173/api/projects";

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const projectRepository = {

    // ============================================================
    // GET ALL PROJECTS
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
                data.error || "Failed to get projects"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE PROJECT
    // ============================================================

    async getById(id) {

        const response = await fetch(
            `${BASE_URL}/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get project"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE PROJECT
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
                result.error || "Failed to create project"
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

                entity_type: "project",

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
    // UPDATE PROJECT
    // ============================================================

    async update(id, data) {

        // Get old version before changing it
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

        const updatedProject = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedProject.error ||
                "Failed to update project"
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

                entity_type: "project",

                entity_id: id,

                before: before,

                after: updatedProject,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedProject;
    },


    // ============================================================
    // SOFT DELETE PROJECT
    //
    // Soft delete is implemented as an UPDATE.
    // The backend should handle the soft-delete field.
    // ============================================================

    async softDelete(id) {

        // Get old version before changing it
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

        const updatedProject = await response.json();

        if (!response.ok) {
            throw new Error(
                updatedProject.error ||
                "Failed to soft delete project"
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

                entity_type: "project",

                entity_id: id,

                before: before,

                after: updatedProject,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedProject;
    },


    // ============================================================
    // DELETE PROJECT
    //
    // This is the FINAL/PERMANENT DELETE.
    // ============================================================

    async delete(id) {

        // Get old version before deleting
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
                "Failed to delete project"
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

                entity_type: "project",

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