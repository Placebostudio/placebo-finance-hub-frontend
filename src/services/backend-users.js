const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/users`;

const LOGGED_IN_USER_KEY =
    "logged_in_user";

import { auditRepository } from "./backend-audits.js";


export const userRepository = {

    // ============================================================
    // GET ALL USERS
    // GET /api/users
    // ============================================================

    async getAll() {

        const currentUser =
            this.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const response =
            await fetch(
                `${BASE_URL}?user_id=${encodeURIComponent(userId)}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get users"
            );
        }


        return data;
    },


    // ============================================================
    // GET ONE USER
    // GET /api/users/:userid
    // ============================================================

    async getById(id) {

        const currentUser =
            this.getLoggedInUser();

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


        if (response.status === 404) {
            return null;
        }


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get user"
            );
        }


        return data;
    },


    // ============================================================
    // GET ACTIVE USERS
    // ============================================================

    async getActive() {

        const users =
            await this.getAll();


        return users.filter(
            (user) =>
                user.is_active
        );
    },


    // ============================================================
    // LOGIN
    // POST /api/users/login
    // ============================================================

    async login(username, password) {

        const response =
            await fetch(
                `${BASE_URL}/login`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        username,
                        password
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Login failed"
            );
        }


        // ========================================================
        // STORE LOGGED-IN USER
        // ========================================================

        localStorage.setItem(
            LOGGED_IN_USER_KEY,
            JSON.stringify(data.user)
        );


        // ========================================================
        // AUDIT LOGIN
        // ========================================================

        if (data.user?.id) {

            await auditRepository.create({

                actor_id:
                    data.user.id,

                action:
                    "login",

                entity_type:
                    "user",

                entity_id:
                    data.user.id,

                before:
                    null,

                after:
                    data.user,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        return data;
    },


    // ============================================================
    // GET LOGGED-IN USER
    // ============================================================

    getLoggedInUser() {

        const storedUser =
            localStorage.getItem(
                LOGGED_IN_USER_KEY
            );


        if (!storedUser) {
            return null;
        }


        try {

            return JSON.parse(
                storedUser
            );

        } catch (err) {

            console.error(
                "Invalid logged-in user in localStorage",
                err
            );


            localStorage.removeItem(
                LOGGED_IN_USER_KEY
            );


            return null;
        }
    },


    // ============================================================
    // LOGOUT
    // ============================================================

    async logout() {

        const currentUser =
            this.getLoggedInUser();


        // ========================================================
        // AUDIT LOGOUT
        // ========================================================

        if (currentUser?.id) {

            await auditRepository.create({

                actor_id:
                    currentUser.id,

                action:
                    "logout",

                entity_type:
                    "user",

                entity_id:
                    currentUser.id,

                before:
                    currentUser,

                after:
                    null,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        localStorage.removeItem(
            LOGGED_IN_USER_KEY
        );
    },


    // ============================================================
    // CREATE / INVITE USER
    // POST /api/users
    // ============================================================

    async create(data) {

        const currentUser =
            this.getLoggedInUser();

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

                        user_id:
                            userId,

                        username:
                            data.username,

                        email:
                            data.email,

                        password:
                            data.password,

                        full_name:
                            data.fullName ??
                            data.full_name,

                        role:
                            data.role ??
                            "viewer"
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to create user"
            );
        }


        const user =
            result.user ?? result;


        // ========================================================
        // AUDIT USER CREATION
        // ========================================================

        if (user?.id) {

            await auditRepository.create({

                actor_id:
                    userId,

                action:
                    "create",

                entity_type:
                    "user",

                entity_id:
                    user.id,

                before:
                    null,

                after:
                    user,

                ip_address:
                    null,

                user_agent:
                    navigator.userAgent
            });
        }


        return user;
    },


    // ============================================================
    // UPDATE USER
    // PUT /api/users/:userid
    // ============================================================

    async update(id, changes) {

        const currentUser =
            this.getLoggedInUser();

        const userId =
            currentUser?.id;


        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        // ========================================================
        // GET ORIGINAL USER
        // ========================================================

        const before =
            await this.getById(id);


        // ========================================================
        // BUILD REQUEST BODY
        // ========================================================

        const body = {

            user_id:
                userId,

            email:
                changes.email,

            username:
                changes.username,

            full_name:
                changes.full_name ??
                changes.fullName,

            role:
                changes.role,

            is_active:
                changes.is_active !== undefined
                    ? changes.is_active
                    : changes.isActive
        };


        // ========================================================
        // PASSWORD
        // ========================================================

        if (changes.password) {

            body.password =
                changes.password;
        }


        // ========================================================
        // REQUEST
        // ========================================================

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
                        JSON.stringify(body)
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to update user"
            );
        }


        const updatedUser =
            result.user ?? result;


        // ========================================================
        // AUDIT USER UPDATE
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "update",

            entity_type:
                "user",

            entity_id:
                id,

            before,

            after:
                updatedUser,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedUser;
    },


    // ============================================================
    // DEACTIVATE USER
    // DELETE /api/users/:userid
    // ============================================================

    async delete(id) {

        const currentUser =
            this.getLoggedInUser();

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
                    method: "DELETE",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        user_id:
                            userId
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to deactivate user"
            );
        }


        // ========================================================
        // AUDIT USER DELETION
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "delete",

            entity_type:
                "user",

            entity_id:
                id,

            before,

            after:
                null,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return result;
    },


    // ============================================================
    // REACTIVATE USER
    // PUT /api/users/:userid/reactivate
    // ============================================================

    async reactivate(id) {

        const currentUser =
            this.getLoggedInUser();

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
                `${BASE_URL}/${id}/reactivate`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        user_id:
                            userId
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to reactivate user"
            );
        }


        const user =
            result.user ?? result;


        // ========================================================
        // AUDIT USER REACTIVATION
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "reactivate",

            entity_type:
                "user",

            entity_id:
                id,

            before,

            after:
                user,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return user;
    },


    // ============================================================
    // ACCEPT INVITATION
    // PUT /api/users/:userid/accept-invitation
    // ============================================================

    async acceptInvitation(id) {

        const currentUser =
            this.getLoggedInUser();

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
                `${BASE_URL}/${id}/accept-invitation`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        user_id:
                            userId
                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Failed to accept invitation"
            );
        }


        const user =
            result.user ?? result;


        // ========================================================
        // AUDIT INVITATION ACCEPTANCE
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "accept_invitation",

            entity_type:
                "user",

            entity_id:
                id,

            before,

            after:
                user,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return user;
    }
};