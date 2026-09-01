const BASE_URL = `https://placebo-finance-hub-backend.onrender.com/api/jobs`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";

export const jobRepository = {

    // ============================================================
    // GET ALL JOBS
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
                "Failed to get jobs"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE JOB
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

        const params =
            new URLSearchParams();

        params.set(
            "user_id",
            userId
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
                "Failed to get job"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE JOB
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
                "Failed to create job"
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
                    "job",

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
    // UPDATE JOB
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

        const updatedJob =
            await response.json();

        if (!response.ok) {
            throw new Error(
                updatedJob.error ||
                "Failed to update job"
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
                "job",

            entity_id:
                id,

            before:
                before,

            after:
                updatedJob,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedJob;
    },


    // ============================================================
    // SOFT DELETE JOB
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

        const updatedJob =
            await response.json();

        if (!response.ok) {
            throw new Error(
                updatedJob.error ||
                "Failed to soft delete job"
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
                "job",

            entity_id:
                id,

            before:
                before,

            after:
                updatedJob,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedJob;
    },


    // ============================================================
    // DELETE JOB
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


        const params =
            new URLSearchParams();

        params.set(
            "user_id",
            userId
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
                "Failed to delete job"
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
                "job",

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