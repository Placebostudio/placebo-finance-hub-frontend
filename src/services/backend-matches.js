const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/matches`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";


export const matchRepository = {

    // ============================================================
    // GET ALL MATCHES
    // ============================================================

    async getAll(filters = {}) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        const role =
            currentUser?.role;

        if (!userId || !role) {
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

        params.set(
            "role",
            role
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
                "Failed to get matches"
            );
        }


        return data;
    },


    // ============================================================
    // GET ONE MATCH
    // ============================================================

    async getById(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        const role =
            currentUser?.role;

        if (!userId || !role) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const params =
            new URLSearchParams({
                user_id: userId,
                role: role
            });


        const response =
            await fetch(
                `${BASE_URL}/${id}?${params.toString()}`
            );

        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get match"
            );
        }


        return data;
    },


    // ============================================================
    // GET MATCHES BY EXPENSE
    // ============================================================

    async getByExpense(expenseId) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        const role =
            currentUser?.role;

        if (!userId || !role) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const params =
            new URLSearchParams({
                user_id: userId,
                role: role
            });


        const response =
            await fetch(
                `${BASE_URL}/expense/${expenseId}?${params.toString()}`
            );

        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get matches for expense"
            );
        }


        return data;
    },


    // ============================================================
    // GET MATCHES BY TRANSACTION
    // ============================================================

    async getByTransaction(transactionId) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        const role =
            currentUser?.role;

        if (!userId || !role) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const params =
            new URLSearchParams({
                user_id: userId,
                role: role
            });


        const response =
            await fetch(
                `${BASE_URL}/transaction/${transactionId}?${params.toString()}`
            );

        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get matches for transaction"
            );
        }


        return data;
    },


    // ============================================================
    // CREATE MATCH
    // ============================================================

    async create(data) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        const role =
            currentUser?.role;

        if (!userId || !role) {
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
                        user_id: userId,
                        role: role
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to create match"
            );
        }


        const match =
            result.match ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        if (match.id) {

            await auditRepository.create({

                actor_id:
                    userId,

                action:
                    "create",

                entity_type:
                    "match",

                entity_id:
                    match.id,

                before:
                    null,

                after:
                    match,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        return result;
    },


    // ============================================================
    // UPDATE MATCH
    // ============================================================

    async update(id, data) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        const role =
            currentUser?.role;

        if (!userId || !role) {
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
                        user_id: userId,
                        role: role
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to update match"
            );
        }


        const updatedMatch =
            result.match ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "update",

            entity_type:
                "match",

            entity_id:
                id,

            before:
                before,

            after:
                updatedMatch,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return result;
    },


    // ============================================================
    // SOFT DELETE MATCH
    // ============================================================

    async softDelete(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        const role =
            currentUser?.role;

        if (!userId || !role) {
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
                        user_id: userId,
                        role: role
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to soft delete match"
            );
        }


        const updatedMatch =
            result.match ?? result;


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "soft_delete",

            entity_type:
                "match",

            entity_id:
                id,

            before:
                before,

            after:
                updatedMatch,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return result;
    },


    // ============================================================
    // DELETE MATCH
    // ============================================================

    async delete(id) {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        const role =
            currentUser?.role;

        if (!userId || !role) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const before =
            await this.getById(id);


        const params =
            new URLSearchParams({
                user_id: userId,
                role: role
            });


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
                "Failed to delete match"
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
                "match",

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