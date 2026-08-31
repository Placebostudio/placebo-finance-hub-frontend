const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/projects`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const projectRepository = {

    // ============================================================
    // GET ALL PROJECTS
    // ============================================================

    async getAll(filters = {}) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


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

        params.set(
            "user_id",
            userId
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
                "Failed to get projects"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE PROJECT
    // ============================================================

    async getById(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const response =
            await fetch(
                `${BASE_URL}/${id}?user_id=${encodeURIComponent(userId)}`
            );

        const data =
            await response.json();


        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get project"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE PROJECT
    // ============================================================

    async create(data) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
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
                        user_id: userId
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to create project"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (result.id) {

            await auditRepository.create({

                actor_id:
                    userId,

                action:
                    "create",

                entity_type:
                    "project",

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
    // UPDATE PROJECT
    // ============================================================

    async update(id, data) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
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
                        ...data,
                        user_id: userId
                    })
                }
            );


        const updatedProject =
            await response.json();


        if (!response.ok) {
            throw new Error(
                updatedProject.error ||
                "Failed to update project"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "update",

            entity_type:
                "project",

            entity_id:
                id,

            before:
                before,

            after:
                updatedProject,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedProject;
    },


    // ============================================================
    // SOFT DELETE PROJECT
    // ============================================================

    async softDelete(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
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
                        spam: true,
                        user_id: userId
                    })
                }
            );


        const updatedProject =
            await response.json();


        if (!response.ok) {
            throw new Error(
                updatedProject.error ||
                "Failed to soft delete project"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "soft_delete",

            entity_type:
                "project",

            entity_id:
                id,

            before:
                before,

            after:
                updatedProject,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedProject;
    },


    // ============================================================
    // DELETE PROJECT
    //
    // FINAL / PERMANENT DELETE
    // ============================================================

    async delete(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const before =
            await this.getById(id);


        const response =
            await fetch(
                `${BASE_URL}/${id}?user_id=${encodeURIComponent(userId)}`,
                {
                    method: "DELETE"
                }
            );


        const result =
            await response.json();


        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to delete project"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "delete",

            entity_type:
                "project",

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